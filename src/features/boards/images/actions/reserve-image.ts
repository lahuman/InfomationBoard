"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  IMAGE_FILE_LIMIT_BYTES,
} from "../model";
import { cleanupExpiredBoardImages } from "../storage";

const reserveBoardImageInputSchema = z
  .object({
    boardId: z.uuid(),
    originalFilename: z.string().min(1).max(1_000),
    mimeType: z.enum(ACCEPTED_IMAGE_MIME_TYPES),
    sizeBytes: z.number().int().min(1).max(IMAGE_FILE_LIMIT_BYTES),
  })
  .strict();

const reservedRowSchema = z
  .object({
    id: z.uuid(),
    storage_path: z.string().min(1),
    original_filename: z.string().min(1),
    mime_type: z.enum(ACCEPTED_IMAGE_MIME_TYPES),
    size_bytes: z.number().int().min(1).max(IMAGE_FILE_LIMIT_BYTES),
    reservation_expires_at: z.string().datetime({ offset: true }),
  })
  .strict();

const INVALID_MESSAGE = "업로드할 이미지를 확인해 주세요.";
const UNAVAILABLE_MESSAGE =
  "이미지 업로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export type ReserveBoardImageInput = {
  boardId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
};

export type ReserveBoardImageResult =
  | {
      status: "reserved";
      attachmentId: string;
      path: string;
    }
  | {
      status: "error";
      code: "invalid" | "quota" | "limit" | "unavailable";
      message: string;
    };

function normalizeDisplayFilename(filename: string): string {
  const withoutControls = Array.from(filename)
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint !== undefined &&
        codePoint > 0x1f &&
        !(codePoint >= 0x7f && codePoint <= 0x9f)
      );
    })
    .join("");
  const basename = withoutControls.split(/[\\/]/).at(-1)?.trim() ?? "";
  return Array.from((basename || "image").normalize("NFC"))
    .slice(0, 180)
    .join("");
}

function applicationErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  return record.code === "P0001" && typeof record.message === "string"
    ? record.message
    : null;
}

function mapReserveError(error: unknown): ReserveBoardImageResult {
  switch (applicationErrorMessage(error)) {
    case "image_quota_exceeded":
      return {
        status: "error",
        code: "quota",
        message: "남은 저장 공간이 부족합니다.",
      };
    case "image_limit_exceeded":
      return {
        status: "error",
        code: "limit",
        message: "안내판에는 이미지를 최대 20개까지 추가할 수 있습니다.",
      };
    case "image_invalid_size":
    case "image_invalid_mime_type":
      return { status: "error", code: "invalid", message: INVALID_MESSAGE };
    default:
      return {
        status: "error",
        code: "unavailable",
        message: UNAVAILABLE_MESSAGE,
      };
  }
}

export async function reserveBoardImage(
  input: ReserveBoardImageInput,
): Promise<ReserveBoardImageResult> {
  const parsed = reserveBoardImageInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", code: "invalid", message: INVALID_MESSAGE };
  }

  const user = await requireUser(`/boards/${parsed.data.boardId}/edit`);
  const supabase = await createServerSupabaseClient();

  const cleanup = await cleanupExpiredBoardImages(user.id, supabase);
  if (!cleanup.ok) {
    return {
      status: "error",
      code: "unavailable",
      message: UNAVAILABLE_MESSAGE,
    };
  }

  let reserveResult;
  try {
    reserveResult = await supabase.rpc("reserve_board_image", {
      p_board_id: parsed.data.boardId,
      p_original_filename: normalizeDisplayFilename(
        parsed.data.originalFilename,
      ),
      p_mime_type: parsed.data.mimeType,
      p_size_bytes: parsed.data.sizeBytes,
    });
  } catch {
    return {
      status: "error",
      code: "unavailable",
      message: UNAVAILABLE_MESSAGE,
    };
  }

  if (reserveResult.error) return mapReserveError(reserveResult.error);

  const reservedRows = z
    .array(reservedRowSchema)
    .length(1)
    .safeParse(reserveResult.data);
  if (!reservedRows.success) {
    return {
      status: "error",
      code: "unavailable",
      message: UNAVAILABLE_MESSAGE,
    };
  }
  const reserved = reservedRows.data.at(0);
  if (!reserved) {
    return {
      status: "error",
      code: "unavailable",
      message: UNAVAILABLE_MESSAGE,
    };
  }

  return {
    status: "reserved",
    attachmentId: reserved.id,
    path: reserved.storage_path,
  };
}
