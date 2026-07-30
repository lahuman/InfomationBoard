import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  ACCESS_COOKIE_NAME,
  verifyAccessToken,
} from "@/features/boards/access/access-cookie";
import { getPasswordBoardBySlug } from "@/features/boards/access/password-board";
import { getPublicBoardBySlug } from "@/features/boards/public/queries";
import { getServerEnv } from "@/lib/env/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  IMAGE_FILE_LIMIT_BYTES,
} from "./model";

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const attachmentIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
const userIdSchema = z.uuid();

const deliverableRowSchema = z
  .object({
    id: z.uuid(),
    board_id: z.uuid(),
    owner_id: z.uuid(),
    storage_path: z.string().min(1),
    mime_type: z.enum(ACCEPTED_IMAGE_MIME_TYPES),
    size_bytes: z.number().int().positive().max(IMAGE_FILE_LIMIT_BYTES),
    state: z.literal("ready"),
    boards: z
      .object({
        id: z.uuid(),
        slug: slugSchema,
        owner_id: z.uuid(),
        deletion_started_at: z.null(),
      })
      .strict(),
  })
  .strict();

const DELIVERY_COLUMNS =
  "id, board_id, owner_id, storage_path, mime_type, size_bytes, state, boards!inner(id, slug, owner_id, deletion_started_at)";

export type DeliverableBoardImage = {
  storagePath: string;
  mimeType: (typeof ACCEPTED_IMAGE_MIME_TYPES)[number];
  sizeBytes: number;
};

function mapDeliverableRow(
  value: unknown,
  expected: {
    slug: string;
    attachmentId: string;
    boardId?: string;
    ownerId?: string;
  },
): DeliverableBoardImage | null {
  const row = deliverableRowSchema.safeParse(value);
  if (
    !row.success ||
    row.data.id !== expected.attachmentId ||
    row.data.boards.id !== row.data.board_id ||
    row.data.boards.slug !== expected.slug ||
    row.data.boards.owner_id !== row.data.owner_id ||
    (expected.boardId !== undefined &&
      row.data.board_id !== expected.boardId) ||
    (expected.ownerId !== undefined &&
      row.data.owner_id !== expected.ownerId)
  ) {
    return null;
  }

  return {
    storagePath: row.data.storage_path,
    mimeType: row.data.mime_type,
    sizeBytes: row.data.size_bytes,
  };
}

async function loadAdminAttachment(
  slug: string,
  attachmentId: string,
  boardId: string,
): Promise<DeliverableBoardImage | null> {
  try {
    const { data, error } = await createAdminSupabaseClient()
      .from("attachments")
      .select(DELIVERY_COLUMNS)
      .eq("id", attachmentId)
      .eq("board_id", boardId)
      .eq("state", "ready")
      .eq("boards.slug", slug)
      .is("boards.deletion_started_at", null)
      .maybeSingle();

    return error
      ? null
      : mapDeliverableRow(data, { slug, attachmentId, boardId });
  } catch {
    return null;
  }
}

export async function getDeliverableBoardImage(
  slug: string,
  attachmentId: string,
): Promise<DeliverableBoardImage | null> {
  if (
    !slugSchema.safeParse(slug).success ||
    !attachmentIdSchema.safeParse(attachmentId).success
  ) {
    return null;
  }

  try {
    const supabase = await createServerSupabaseClient();
    const claimsResult = await supabase.auth.getClaims();
    const ownerId = userIdSchema.safeParse(
      claimsResult.error ? undefined : claimsResult.data?.claims?.sub,
    );

    if (ownerId.success) {
      const { data, error } = await supabase
        .from("attachments")
        .select(DELIVERY_COLUMNS)
        .eq("id", attachmentId)
        .eq("owner_id", ownerId.data)
        .eq("state", "ready")
        .eq("boards.slug", slug)
        .is("boards.deletion_started_at", null)
        .maybeSingle();

      if (!error && data !== null) {
        return mapDeliverableRow(data, {
          slug,
          attachmentId,
          ownerId: ownerId.data,
        });
      }
    }
  } catch {
    // Owner access is optional; public authorization remains available.
  }

  try {
    const publicBoard = await getPublicBoardBySlug(slug);
    if (publicBoard) {
      return loadAdminAttachment(slug, attachmentId, publicBoard.id);
    }
  } catch {
    // A failed public lookup does not grant access.
  }

  try {
    const passwordBoard = await getPasswordBoardBySlug(slug);
    if (!passwordBoard || passwordBoard.board.slug !== slug) return null;

    const token = (await cookies()).get(ACCESS_COOKIE_NAME)?.value;
    const hasAccess = verifyAccessToken(
      token,
      {
        boardId: passwordBoard.board.id,
        secretVersion: passwordBoard.secretVersion,
      },
      getServerEnv().SUPABASE_SECRET_KEY,
    );
    if (!hasAccess) return null;

    return loadAdminAttachment(
      slug,
      attachmentId,
      passwordBoard.board.id,
    );
  } catch {
    return null;
  }
}
