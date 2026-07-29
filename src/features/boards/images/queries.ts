import "server-only";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  IMAGE_FILE_LIMIT_BYTES,
  type BoardImageLibrary,
  boardImageUrl,
} from "./model";

const imageLibraryInputSchema = z.object({
  ownerId: z.uuid(),
  boardId: z.uuid(),
  boardSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

const imageRowSchema = z
  .object({
    id: z.uuid(),
    original_filename: z.string().min(1),
    mime_type: z.enum(ACCEPTED_IMAGE_MIME_TYPES),
    size_bytes: z.number().int().positive().max(IMAGE_FILE_LIMIT_BYTES),
    state: z.literal("ready"),
  })
  .strict();

const storageUsageSchema = z
  .object({ storage_bytes: z.number().int().nonnegative() })
  .strict();

const IMAGE_COLUMNS =
  "id, original_filename, mime_type, size_bytes, state";

export async function getBoardImageLibrary(
  ownerId: string,
  boardId: string,
  boardSlug: string,
): Promise<BoardImageLibrary | null> {
  const input = imageLibraryInputSchema.safeParse({
    ownerId,
    boardId,
    boardSlug,
  });
  if (!input.success) return null;

  try {
    const supabase = await createServerSupabaseClient();
    const [attachmentsResult, profileResult] = await Promise.all([
      supabase
        .from("attachments")
        .select(IMAGE_COLUMNS)
        .eq("owner_id", input.data.ownerId)
        .eq("board_id", input.data.boardId)
        .eq("state", "ready")
        .order("created_at", { ascending: true }),
      supabase
        .from("profiles")
        .select("storage_bytes")
        .eq("id", input.data.ownerId)
        .single(),
    ]);

    if (
      attachmentsResult.error ||
      !attachmentsResult.data ||
      profileResult.error ||
      !profileResult.data
    ) {
      return null;
    }

    const images = z.array(imageRowSchema).safeParse(attachmentsResult.data);
    const usage = storageUsageSchema.safeParse(profileResult.data);
    if (!images.success || !usage.success) return null;

    return {
      storageBytes: usage.data.storage_bytes,
      images: images.data.map((image) => ({
        id: image.id,
        originalFilename: image.original_filename,
        mimeType: image.mime_type,
        sizeBytes: image.size_bytes,
        url: boardImageUrl(input.data.boardSlug, image.id),
      })),
    };
  } catch {
    return null;
  }
}
