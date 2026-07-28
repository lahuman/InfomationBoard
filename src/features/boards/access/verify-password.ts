"use server";

import { verify } from "argon2";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { getServerEnv } from "@/lib/env/server";
import {
  ACCESS_COOKIE_NAME,
  accessCookieOptions,
  createAccessToken,
} from "./access-cookie";
import {
  clearPasswordFailures,
  getPasswordLock,
  recordPasswordFailure,
} from "./lockout";
import { getPasswordBoardBySlug } from "./password-board";
import { coarseVisitorKey, hashVisitorKey } from "./visitor-key";

const verifyPasswordInputSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    password: z.string().refine(
      (password) => {
        const length = Array.from(password).length;
        return length >= 1 && length <= 128;
      },
      { message: "invalid password length" },
    ),
  })
  .strict();

export type VerifyPasswordResult =
  | { status: "unlocked" }
  | { status: "invalid" | "locked" | "error"; message: string };

const INVALID_MESSAGE = "비밀번호를 확인해 주세요.";
const LOCKED_MESSAGE = "잠시 후 다시 시도해 주세요.";
const ERROR_MESSAGE = "접근을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export async function verifyPasswordAccess(
  input: { slug: string; password: string },
): Promise<VerifyPasswordResult> {
  const parsed = verifyPasswordInputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", message: INVALID_MESSAGE };

  try {
    const protectedBoard = await getPasswordBoardBySlug(parsed.data.slug);
    if (!protectedBoard) {
      return { status: "invalid", message: INVALID_MESSAGE };
    }

    const requestHeaders = await headers();
    const forwardedAddress =
      requestHeaders.get("x-real-ip") ??
      requestHeaders.get("x-forwarded-for");
    const secret = getServerEnv().SUPABASE_SECRET_KEY;
    const visitorHash = hashVisitorKey(
      coarseVisitorKey(forwardedAddress),
      secret,
    );
    const lock = await getPasswordLock(
      protectedBoard.board.id,
      visitorHash,
    );

    if (!lock) return { status: "error", message: ERROR_MESSAGE };
    if (lock.lockedUntil) {
      return { status: "locked", message: LOCKED_MESSAGE };
    }

    const passwordMatches = await verify(
      protectedBoard.passwordHash,
      parsed.data.password,
    );
    if (!passwordMatches) {
      const failure = await recordPasswordFailure(
        protectedBoard.board.id,
        visitorHash,
      );
      if (!failure) return { status: "error", message: ERROR_MESSAGE };
      return failure.locked
        ? { status: "locked", message: LOCKED_MESSAGE }
        : { status: "invalid", message: INVALID_MESSAGE };
    }

    const cleared = await clearPasswordFailures(
      protectedBoard.board.id,
      visitorHash,
    );
    if (!cleared) return { status: "error", message: ERROR_MESSAGE };

    const token = createAccessToken(
      {
        boardId: protectedBoard.board.id,
        secretVersion: protectedBoard.secretVersion,
      },
      secret,
    );
    const cookieStore = await cookies();
    cookieStore.set(
      ACCESS_COOKIE_NAME,
      token,
      accessCookieOptions(
        protectedBoard.board.slug,
        process.env.NODE_ENV === "production",
      ),
    );
    return { status: "unlocked" };
  } catch {
    return { status: "error", message: ERROR_MESSAGE };
  }
}
