import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const ACCESS_COOKIE_NAME = "ib_board_access";
export const ACCESS_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;

type AccessGrant = {
  boardId: string;
  secretVersion: string;
};

const accessPayloadSchema = z
  .object({
    b: z.uuid(),
    e: z.number().int().positive(),
    s: z.string().min(1),
  })
  .strict();

function signature(value: string, secret: string) {
  return createHmac("sha256", secret)
    .update("informationboard:access-cookie:v1\0")
    .update(value)
    .digest("base64url");
}

export function createAccessToken(
  grant: AccessGrant,
  secret: string,
  now = new Date(),
): string {
  const payload = Buffer.from(
    JSON.stringify({
      b: grant.boardId,
      e: now.getTime() + ACCESS_COOKIE_MAX_AGE_SECONDS * 1000,
      s: grant.secretVersion,
    }),
  ).toString("base64url");
  const signedValue = `v1.${payload}`;
  return `${signedValue}.${signature(signedValue, secret)}`;
}

export function verifyAccessToken(
  token: string | undefined,
  expected: AccessGrant,
  secret: string,
  now = new Date(),
): boolean {
  if (!token) return false;
  const [version, payloadValue, suppliedSignature, extra] = token.split(".");
  if (version !== "v1" || !payloadValue || !suppliedSignature || extra) {
    return false;
  }

  const signedValue = `${version}.${payloadValue}`;
  const expectedSignature = signature(signedValue, secret);
  const suppliedBytes = Buffer.from(suppliedSignature);
  const expectedBytes = Buffer.from(expectedSignature);
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    return false;
  }

  try {
    const payload = accessPayloadSchema.parse(
      JSON.parse(Buffer.from(payloadValue, "base64url").toString("utf8")),
    );
    return (
      payload.b === expected.boardId &&
      payload.s === expected.secretVersion &&
      payload.e > now.getTime()
    );
  } catch {
    return false;
  }
}

export function accessCookieOptions(slug: string, secure: boolean) {
  return {
    httpOnly: true,
    maxAge: ACCESS_COOKIE_MAX_AGE_SECONDS,
    path: `/b/${slug}`,
    sameSite: "lax" as const,
    secure,
  };
}
