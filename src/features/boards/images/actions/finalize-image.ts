"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/require-user";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  ACCOUNT_STORAGE_LIMIT_BYTES,
  IMAGE_BUCKET,
  IMAGE_FILE_LIMIT_BYTES,
  boardImageUrl,
  type BoardImage,
} from "../model";
import {
  InvalidStoredImageError,
  isMissingStorageObjectError,
  verifyStoredImage,
} from "../storage";

const finalizeBoardImageInputSchema = z
  .object({
    boardId: z.uuid(),
    attachmentId: z.uuid(),
  })
  .strict();

const ownedAttachmentSchema = z
  .object({
    id: z.uuid(),
    board_id: z.uuid(),
    storage_path: z.string().min(1),
    original_filename: z.string().min(1),
    mime_type: z.enum(ACCEPTED_IMAGE_MIME_TYPES),
    size_bytes: z.number().int().min(1).max(IMAGE_FILE_LIMIT_BYTES),
    state: z.enum(["reserved", "ready"]),
    reservation_expires_at: z.string().nullable(),
    boards: z.object({ slug: z.string().min(1) }).strict(),
  })
  .strict();

const readyRowSchema = z
  .object({
    id: z.uuid(),
    storage_path: z.string().min(1),
    original_filename: z.string().min(1),
    mime_type: z.enum(ACCEPTED_IMAGE_MIME_TYPES),
    size_bytes: z.number().int().min(1).max(IMAGE_FILE_LIMIT_BYTES),
    state: z.literal("ready"),
    reservation_expires_at: z.null(),
  })
  .strict();

const usageSchema = z
  .object({
    storage_bytes: z
      .number()
      .int()
      .min(0)
      .max(ACCOUNT_STORAGE_LIMIT_BYTES),
  })
  .strict();

const INVALID_INPUT_MESSAGE = "업로드 정보를 확인해 주세요.";
const INVALID_IMAGE_MESSAGE =
  "업로드한 이미지가 올바른 JPEG, PNG, WebP 또는 GIF가 아닙니다.";
const UNAVAILABLE_MESSAGE =
  "이미지 업로드를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export type FinalizeBoardImageInput = {
  boardId: string;
  attachmentId: string;
};

export type FinalizeBoardImageResult =
  | { status: "ready"; image: BoardImage; storageBytes: number }
  | {
      status: "error";
      code: "invalid" | "expired" | "quota" | "unavailable";
      message: string;
    };

function applicationErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  return record.code === "P0001" && typeof record.message === "string"
    ? record.message
    : null;
}

function mappedFinalizeError(
  error: unknown,
): Extract<FinalizeBoardImageResult, { status: "error" }> {
  switch (applicationErrorMessage(error)) {
    case "image_reservation_expired":
      return {
        status: "error",
        code: "expired",
        message: "업로드 예약이 만료되었습니다. 다시 업로드해 주세요.",
      };
    case "image_quota_exceeded":
      return {
        status: "error",
        code: "quota",
        message: "남은 저장 공간이 부족합니다.",
      };
    case "image_invalid_size":
    case "image_invalid_mime_type":
    case "image_already_finalized":
      return {
        status: "error",
        code: "invalid",
        message: INVALID_IMAGE_MESSAGE,
      };
    default:
      return {
        status: "error",
        code: "unavailable",
        message: UNAVAILABLE_MESSAGE,
      };
  }
}

async function cleanupReservation(
  path: string,
  attachmentId: string,
  authenticatedClient: Awaited<
    ReturnType<typeof createServerSupabaseClient>
  >,
): Promise<boolean> {
  let removeResult;
  try {
    removeResult = await createAdminSupabaseClient()
      .storage.from(IMAGE_BUCKET)
      .remove([path]);
  } catch {
    return false;
  }
  if (
    removeResult.error &&
    !isMissingStorageObjectError(removeResult.error)
  ) {
    return false;
  }

  try {
    const cancelResult = await authenticatedClient.rpc(
      "cancel_board_image",
      { p_attachment_id: attachmentId },
    );
    return (
      !cancelResult.error ||
      applicationErrorMessage(cancelResult.error) === "image_not_found"
    );
  } catch {
    return false;
  }
}

export async function finalizeBoardImage(
  input: FinalizeBoardImageInput,
): Promise<FinalizeBoardImageResult> {
  const parsed = finalizeBoardImageInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      code: "invalid",
      message: INVALID_INPUT_MESSAGE,
    };
  }

  const user = await requireUser(`/boards/${parsed.data.boardId}/edit`);
  const supabase = await createServerSupabaseClient();

  let attachmentResult;
  try {
    attachmentResult = await supabase
      .from("attachments")
      .select(
        "id, board_id, storage_path, original_filename, mime_type, size_bytes, state, reservation_expires_at, boards!inner(slug)",
      )
      .eq("id", parsed.data.attachmentId)
      .eq("board_id", parsed.data.boardId)
      .eq("owner_id", user.id)
      .maybeSingle();
  } catch {
    return {
      status: "error",
      code: "unavailable",
      message: UNAVAILABLE_MESSAGE,
    };
  }

  if (attachmentResult.error || !attachmentResult.data) {
    return {
      status: "error",
      code: "unavailable",
      message: UNAVAILABLE_MESSAGE,
    };
  }

  const ownedAttachment = ownedAttachmentSchema.safeParse(
    attachmentResult.data,
  );
  if (!ownedAttachment.success) {
    return {
      status: "error",
      code: "unavailable",
      message: UNAVAILABLE_MESSAGE,
    };
  }
  const attachment = ownedAttachment.data;

  let verified;
  try {
    verified = await verifyStoredImage(attachment.storage_path);
  } catch (error) {
    const invalid = error instanceof InvalidStoredImageError;
    if (attachment.state === "reserved") {
      const cleaned = await cleanupReservation(
        attachment.storage_path,
        attachment.id,
        supabase,
      );
      if (!cleaned) {
        return {
          status: "error",
          code: "unavailable",
          message: UNAVAILABLE_MESSAGE,
        };
      }
    }
    return invalid
      ? {
          status: "error",
          code: "invalid",
          message: INVALID_IMAGE_MESSAGE,
        }
      : {
          status: "error",
          code: "unavailable",
          message: UNAVAILABLE_MESSAGE,
        };
  }

  if (verified.mimeType !== attachment.mime_type) {
    if (attachment.state === "reserved") {
      const cleaned = await cleanupReservation(
        attachment.storage_path,
        attachment.id,
        supabase,
      );
      if (!cleaned) {
        return {
          status: "error",
          code: "unavailable",
          message: UNAVAILABLE_MESSAGE,
        };
      }
    }
    return {
      status: "error",
      code: "invalid",
      message: INVALID_IMAGE_MESSAGE,
    };
  }

  let finalizeResult;
  try {
    finalizeResult = await supabase.rpc("finalize_board_image", {
      p_attachment_id: attachment.id,
      p_mime_type: verified.mimeType,
      p_actual_size_bytes: verified.bytes.byteLength,
    });
  } catch {
    finalizeResult = {
      data: null,
      error: { code: "unavailable", message: "unavailable" },
    };
  }

  if (finalizeResult.error) {
    const mapped = mappedFinalizeError(finalizeResult.error);
    if (attachment.state === "reserved") {
      const cleaned = await cleanupReservation(
        attachment.storage_path,
        attachment.id,
        supabase,
      );
      if (!cleaned) {
        return {
          status: "error",
          code: "unavailable",
          message: UNAVAILABLE_MESSAGE,
        };
      }
    }
    return mapped;
  }

  const readyRows = z
    .array(readyRowSchema)
    .length(1)
    .safeParse(finalizeResult.data);
  if (!readyRows.success) {
    return {
      status: "error",
      code: "unavailable",
      message: UNAVAILABLE_MESSAGE,
    };
  }
  const ready = readyRows.data.at(0);
  if (!ready) {
    return {
      status: "error",
      code: "unavailable",
      message: UNAVAILABLE_MESSAGE,
    };
  }
  if (
    ready.id !== attachment.id ||
    ready.storage_path !== attachment.storage_path
  ) {
    return {
      status: "error",
      code: "unavailable",
      message: UNAVAILABLE_MESSAGE,
    };
  }

  let profileResult;
  try {
    profileResult = await supabase
      .from("profiles")
      .select("storage_bytes")
      .eq("id", user.id)
      .single();
  } catch {
    return {
      status: "error",
      code: "unavailable",
      message: UNAVAILABLE_MESSAGE,
    };
  }

  const usage = usageSchema.safeParse(profileResult.data);
  if (profileResult.error || !usage.success) {
    return {
      status: "error",
      code: "unavailable",
      message: UNAVAILABLE_MESSAGE,
    };
  }

  return {
    status: "ready",
    image: {
      id: ready.id,
      originalFilename: ready.original_filename,
      mimeType: ready.mime_type,
      sizeBytes: ready.size_bytes,
      url: boardImageUrl(attachment.boards.slug, ready.id),
    },
    storageBytes: usage.data.storage_bytes,
  };
}
