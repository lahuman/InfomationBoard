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

const expiredRowSchema = z
  .object({
    id: z.uuid(),
    storage_path: z.string().min(1),
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

export type ExpiredBoardImageCleanupResult =
  | { ok: true }
  | { ok: false };

export function isMissingStorageObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const record = error as Record<string, unknown>;
  const status = record.statusCode ?? record.status;
  return (
    status === 404 ||
    status === "404" ||
    (typeof record.message === "string" &&
      record.message.toLowerCase().includes("not found"))
  );
}

function isAlreadyAbsentRpcError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const record = error as Record<string, unknown>;
  return record.code === "P0001" && record.message === "image_not_found";
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

export async function cleanupExpiredBoardImages(
  ownerId: string,
  authenticatedClient: SupabaseClient<Database>,
): Promise<ExpiredBoardImageCleanupResult> {
  if (!z.uuid().safeParse(ownerId).success) return { ok: false };

  const admin = createAdminSupabaseClient();

  let expiredResult;
  try {
    expiredResult = await admin
      .from("attachments")
      .select("id, storage_path")
      .eq("owner_id", ownerId)
      .eq("state", "reserved")
      .lt("reservation_expires_at", new Date().toISOString());
  } catch {
    return { ok: false };
  }

  if (expiredResult.error || !expiredResult.data) return { ok: false };

  const expiredRows = z.array(expiredRowSchema).safeParse(expiredResult.data);
  if (!expiredRows.success) return { ok: false };

  for (const row of expiredRows.data) {
    let removeResult;
    try {
      removeResult = await admin.storage
        .from(IMAGE_BUCKET)
        .remove([row.storage_path]);
    } catch {
      return { ok: false };
    }
    if (
      removeResult.error &&
      !isMissingStorageObjectError(removeResult.error)
    ) {
      return { ok: false };
    }

    let cancelResult;
    try {
      cancelResult = await authenticatedClient.rpc("cancel_board_image", {
        p_attachment_id: row.id,
      });
    } catch {
      return { ok: false };
    }
    if (
      cancelResult.error &&
      !isAlreadyAbsentRpcError(cancelResult.error)
    ) {
      return { ok: false };
    }
  }

  return { ok: true };
}
