"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/require-user";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  ACCOUNT_STORAGE_LIMIT_BYTES,
  IMAGE_FILE_LIMIT_BYTES,
  boardImageUrl,
  type BoardImage,
} from "../model";
import {
  InvalidStoredImageError,
  cancelBoardImageReservation,
  verifyStoredImage,
  type VerifiedStoredImage,
} from "../storage";

const finalizeBoardImageInputSchema = z
  .object({ boardId: z.uuid(), attachmentId: z.uuid() })
  .strict();

const ownedAttachmentSchema = z
  .object({
    id: z.uuid(),
    board_id: z.uuid(),
    storage_path: z.string().min(1),
    original_filename: z.string().min(1),
    mime_type: z.enum(ACCEPTED_IMAGE_MIME_TYPES),
    size_bytes: z.number().int().min(1).max(IMAGE_FILE_LIMIT_BYTES),
    state: z.enum(["reserved", "cancelling", "ready"]),
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
const ATTACHMENT_COLUMNS =
  "id, board_id, storage_path, original_filename, mime_type, size_bytes, state, reservation_expires_at, boards!inner(slug)";

type AuthenticatedClient = Awaited<
  ReturnType<typeof createServerSupabaseClient>
>;
type OwnedAttachment = z.infer<typeof ownedAttachmentSchema>;
type ReadyRow = z.infer<typeof readyRowSchema>;

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

function unavailableResult(): Extract<
  FinalizeBoardImageResult,
  { status: "error" }
> {
  return {
    status: "error",
    code: "unavailable",
    message: UNAVAILABLE_MESSAGE,
  };
}

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
      return unavailableResult();
  }
}

async function loadOwnedAttachment(
  supabase: AuthenticatedClient,
  ownerId: string,
  boardId: string,
  attachmentId: string,
): Promise<{ ok: true; attachment: OwnedAttachment } | { ok: false }> {
  try {
    const result = await supabase
      .from("attachments")
      .select(ATTACHMENT_COLUMNS)
      .eq("id", attachmentId)
      .eq("board_id", boardId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (result.error || !result.data) return { ok: false };
    const parsed = ownedAttachmentSchema.safeParse(result.data);
    return parsed.success
      ? { ok: true, attachment: parsed.data }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}

async function readyResult(
  row: ReadyRow,
  slug: string,
  ownerId: string,
  supabase: AuthenticatedClient,
): Promise<FinalizeBoardImageResult> {
  let profileResult;
  try {
    profileResult = await supabase
      .from("profiles")
      .select("storage_bytes")
      .eq("id", ownerId)
      .single();
  } catch {
    return unavailableResult();
  }
  const usage = usageSchema.safeParse(profileResult.data);
  if (profileResult.error || !usage.success) return unavailableResult();

  return {
    status: "ready",
    image: {
      id: row.id,
      originalFilename: row.original_filename,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      url: boardImageUrl(slug, row.id),
    },
    storageBytes: usage.data.storage_bytes,
  };
}

function readyRowFromOwned(
  attachment: OwnedAttachment,
  verified: VerifiedStoredImage,
): ReadyRow | null {
  if (
    attachment.state !== "ready" ||
    attachment.mime_type !== verified.mimeType ||
    attachment.size_bytes !== verified.bytes.byteLength
  ) {
    return null;
  }
  return {
    id: attachment.id,
    storage_path: attachment.storage_path,
    original_filename: attachment.original_filename,
    mime_type: attachment.mime_type,
    size_bytes: attachment.size_bytes,
    state: "ready",
    reservation_expires_at: null,
  };
}

async function cleanupReserved(
  attachment: OwnedAttachment,
  supabase: AuthenticatedClient,
): Promise<boolean> {
  if (attachment.state !== "reserved") return false;
  const cleanup = await cancelBoardImageReservation(
    attachment.board_id,
    attachment.id,
    supabase,
  );
  return cleanup.ok;
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
  const loaded = await loadOwnedAttachment(
    supabase,
    user.id,
    parsed.data.boardId,
    parsed.data.attachmentId,
  );
  if (!loaded.ok || loaded.attachment.state === "cancelling") {
    return unavailableResult();
  }
  const attachment = loaded.attachment;

  let verified: VerifiedStoredImage;
  try {
    verified = await verifyStoredImage(attachment.storage_path);
  } catch (error) {
    const invalid = error instanceof InvalidStoredImageError;
    if (attachment.state === "reserved") {
      const cleaned = await cleanupReserved(attachment, supabase);
      if (!cleaned) return unavailableResult();
    }
    return invalid
      ? { status: "error", code: "invalid", message: INVALID_IMAGE_MESSAGE }
      : unavailableResult();
  }

  if (verified.mimeType !== attachment.mime_type) {
    if (attachment.state === "reserved") {
      const cleaned = await cleanupReserved(attachment, supabase);
      if (!cleaned) return unavailableResult();
    }
    return { status: "error", code: "invalid", message: INVALID_IMAGE_MESSAGE };
  }

  let finalizeData: unknown = null;
  let finalizeError: unknown;
  try {
    const result = await createAdminSupabaseClient().rpc(
      "finalize_board_image",
      {
        p_owner_id: user.id,
        p_board_id: parsed.data.boardId,
        p_attachment_id: attachment.id,
        p_mime_type: verified.mimeType,
        p_actual_size_bytes: verified.bytes.byteLength,
      },
    );
    finalizeData = result.data;
    finalizeError = result.error;
  } catch (error) {
    finalizeError = error;
  }

  if (!finalizeError) {
    const parsedRows = z.array(readyRowSchema).length(1).safeParse(finalizeData);
    const ready = parsedRows.success ? parsedRows.data.at(0) : undefined;
    if (
      ready &&
      ready.id === attachment.id &&
      ready.storage_path === attachment.storage_path
    ) {
      return readyResult(ready, attachment.boards.slug, user.id, supabase);
    }
    finalizeError = new Error("Invalid finalize response.");
  }

  const current = await loadOwnedAttachment(
    supabase,
    user.id,
    parsed.data.boardId,
    parsed.data.attachmentId,
  );
  if (!current.ok) return unavailableResult();

  const recoveredReady = readyRowFromOwned(current.attachment, verified);
  if (recoveredReady) {
    return readyResult(
      recoveredReady,
      current.attachment.boards.slug,
      user.id,
      supabase,
    );
  }

  if (current.attachment.state !== "reserved") return unavailableResult();
  const cleaned = await cleanupReserved(current.attachment, supabase);
  if (!cleaned) return unavailableResult();
  return mappedFinalizeError(finalizeError);
}
