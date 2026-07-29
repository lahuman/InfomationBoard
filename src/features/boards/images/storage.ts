import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  IMAGE_BUCKET,
  IMAGE_FILE_LIMIT_BYTES,
} from "./model";

const cleanupCandidateSchema = z
  .object({
    id: z.uuid(),
    board_id: z.uuid(),
    owner_id: z.uuid(),
    storage_path: z.string().min(1),
    state: z.enum(["reserved", "cancelling", "deleting"]),
  })
  .strict();

const cancellationClaimSchema = z
  .object({
    id: z.uuid(),
    owner_id: z.uuid(),
    storage_path: z.string().min(1),
    state: z.literal("cancelling"),
  })
  .strict();

const storedImageMimeTypes = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
} as const satisfies Record<
  string,
  (typeof ACCEPTED_IMAGE_MIME_TYPES)[number]
>;

type AuthenticatedClient = SupabaseClient<Database>;

export class InvalidStoredImageError extends Error {
  constructor() {
    super("Invalid stored image.");
    this.name = "InvalidStoredImageError";
  }
}

export class StoredImageUnavailableError extends Error {
  constructor() {
    super("Stored image is unavailable.");
    this.name = "StoredImageUnavailableError";
  }
}

export type VerifiedStoredImage = {
  bytes: Buffer;
  mimeType: (typeof ACCEPTED_IMAGE_MIME_TYPES)[number];
};

export type BoardImageCleanupResult = { ok: true } | { ok: false };

function applicationErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  return record.code === "P0001" && typeof record.message === "string"
    ? record.message
    : null;
}

export function isMissingStorageObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return (
    record.name === "StorageApiError" &&
    record.status === 404 &&
    record.message === "Object not found"
  );
}

export async function verifyStoredImage(
  path: string,
): Promise<VerifiedStoredImage> {
  if (!z.string().min(1).max(1_000).safeParse(path).success) {
    throw new InvalidStoredImageError();
  }

  let downloadResult;
  try {
    downloadResult = await createAdminSupabaseClient()
      .storage.from(IMAGE_BUCKET)
      .download(path);
  } catch {
    throw new StoredImageUnavailableError();
  }

  if (downloadResult.error || !downloadResult.data) {
    if (isMissingStorageObjectError(downloadResult.error)) {
      throw new InvalidStoredImageError();
    }
    throw new StoredImageUnavailableError();
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await downloadResult.data.arrayBuffer());
  } catch {
    throw new StoredImageUnavailableError();
  }

  if (bytes.byteLength < 1 || bytes.byteLength > IMAGE_FILE_LIMIT_BYTES) {
    throw new InvalidStoredImageError();
  }

  try {
    const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .metadata();
    const mimeType =
      storedImageMimeTypes[
        metadata.format as keyof typeof storedImageMimeTypes
      ];
    if (!mimeType) throw new InvalidStoredImageError();
    return { bytes, mimeType };
  } catch (error) {
    if (error instanceof InvalidStoredImageError) throw error;
    throw new InvalidStoredImageError();
  }
}

export async function cancelBoardImageReservation(
  boardId: string,
  attachmentId: string,
  authenticatedClient: AuthenticatedClient,
): Promise<BoardImageCleanupResult> {
  if (
    !z.uuid().safeParse(boardId).success ||
    !z.uuid().safeParse(attachmentId).success
  ) {
    return { ok: false };
  }

  let claimResult;
  try {
    claimResult = await authenticatedClient.rpc(
      "claim_board_image_cancellation",
      { p_board_id: boardId, p_attachment_id: attachmentId },
    );
  } catch {
    return { ok: false };
  }

  if (claimResult.error) {
    return applicationErrorMessage(claimResult.error) === "image_not_found"
      ? { ok: true }
      : { ok: false };
  }

  const claims = z
    .array(cancellationClaimSchema)
    .length(1)
    .safeParse(claimResult.data);
  const claim = claims.success ? claims.data.at(0) : undefined;
  if (!claim || claim.id !== attachmentId) return { ok: false };

  let adminClient;
  let removeResult;
  try {
    adminClient = createAdminSupabaseClient();
    removeResult = await adminClient.storage
      .from(IMAGE_BUCKET)
      .remove([claim.storage_path]);
  } catch {
    return { ok: false };
  }

  if (
    removeResult.error &&
    !isMissingStorageObjectError(removeResult.error)
  ) {
    return { ok: false };
  }

  let completeResult;
  try {
    completeResult = await adminClient.rpc(
      "complete_board_image_cancellation",
      {
        p_owner_id: claim.owner_id,
        p_board_id: boardId,
        p_attachment_id: attachmentId,
      },
    );
  } catch {
    return { ok: false };
  }

  if (
    completeResult.error &&
    applicationErrorMessage(completeResult.error) !== "image_not_found"
  ) {
    return { ok: false };
  }

  return { ok: true };
}

export async function cleanupExpiredBoardImages(
  ownerId: string,
  authenticatedClient: AuthenticatedClient,
  now = new Date(),
): Promise<BoardImageCleanupResult> {
  if (!z.uuid().safeParse(ownerId).success) return { ok: false };

  let candidatesResult;
  try {
    candidatesResult = await createAdminSupabaseClient()
      .from("attachments")
      .select("id, board_id, owner_id, storage_path, state")
      .eq("owner_id", ownerId)
      .or(
        `state.eq.deleting,state.eq.cancelling,and(state.eq.reserved,reservation_expires_at.lt.${now.toISOString()})`,
      );
  } catch {
    return { ok: false };
  }

  if (candidatesResult.error || !candidatesResult.data) return { ok: false };
  const candidates = z
    .array(cleanupCandidateSchema)
    .safeParse(candidatesResult.data);
  if (!candidates.success) return { ok: false };

  for (const candidate of candidates.data) {
    if (candidate.state === "deleting") {
      let adminClient;
      let removeResult;
      try {
        adminClient = createAdminSupabaseClient();
        removeResult = await adminClient.storage
          .from(IMAGE_BUCKET)
          .remove([candidate.storage_path]);
      } catch {
        return { ok: false };
      }

      if (
        removeResult.error &&
        !isMissingStorageObjectError(removeResult.error)
      ) {
        return { ok: false };
      }

      let completeResult;
      try {
        completeResult = await adminClient.rpc(
          "complete_board_image_deletion",
          {
            p_owner_id: candidate.owner_id,
            p_board_id: candidate.board_id,
            p_attachment_id: candidate.id,
          },
        );
      } catch {
        return { ok: false };
      }
      if (
        completeResult.error &&
        applicationErrorMessage(completeResult.error) !== "image_not_found"
      ) {
        return { ok: false };
      }
      continue;
    }

    const cleanup = await cancelBoardImageReservation(
      candidate.board_id,
      candidate.id,
      authenticatedClient,
    );
    if (!cleanup.ok) return { ok: false };
  }

  return { ok: true };
}
