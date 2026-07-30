"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/require-user";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { boardImageUrl, IMAGE_BUCKET } from "../model";
import { hasBoardImageReference } from "../references";
import { isMissingStorageObjectError } from "../storage";

const deleteImageInputSchema = z
  .object({
    boardId: z.uuid(),
    attachmentId: z.uuid(),
  })
  .strict();

const boardRowSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    content_markdown: z.string(),
    revision: z.number().int().positive(),
  })
  .strict();

const attachmentRowSchema = z
  .object({
    id: z.uuid(),
    owner_id: z.uuid(),
    storage_path: z.string().min(1),
    state: z.enum(["ready", "deleting"]),
  })
  .strict();

const deletionClaimSchema = z
  .object({
    id: z.uuid(),
    owner_id: z.uuid(),
    storage_path: z.string().min(1),
    state: z.literal("deleting"),
    board_revision: z.number().int().positive(),
  })
  .strict();

const storageUsageSchema = z
  .object({ storage_bytes: z.number().int().nonnegative() })
  .strict();

const DELETE_ERROR_MESSAGE =
  "이미지를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export type DeleteBoardImageResult =
  | { status: "deleted"; storageBytes?: number; boardRevision: number }
  | { status: "in_use"; message: string }
  | { status: "error"; message: string; boardRevision?: number };

type AuthenticatedClient = Awaited<
  ReturnType<typeof createServerSupabaseClient>
>;

function safeError(boardRevision?: number): DeleteBoardImageResult {
  return {
    status: "error",
    message: DELETE_ERROR_MESSAGE,
    ...(boardRevision === undefined ? {} : { boardRevision }),
  };
}

function revalidateDeletedImage(
  editorPath: string,
  slug: string,
  imageUrl: string,
): void {
  revalidatePath(editorPath);
  revalidatePath("/dashboard");
  revalidatePath(`/b/${slug}`);
  revalidatePath(imageUrl);
}

async function recoverAmbiguousClaim(
  supabase: AuthenticatedClient,
  input: {
    boardId: string;
    attachmentId: string;
    ownerId: string;
    storagePath: string;
    editorPath: string;
  },
): Promise<DeleteBoardImageResult> {
  let boardResult;
  let attachmentResult;
  try {
    [boardResult, attachmentResult] = await Promise.all([
      supabase
        .from("boards")
        .select("slug, content_markdown, revision")
        .eq("id", input.boardId)
        .eq("owner_id", input.ownerId)
        .maybeSingle(),
      supabase
        .from("attachments")
        .select("id, owner_id, storage_path, state")
        .eq("id", input.attachmentId)
        .eq("board_id", input.boardId)
        .eq("owner_id", input.ownerId)
        .in("state", ["ready", "deleting"])
        .maybeSingle(),
    ]);
  } catch {
    return safeError();
  }

  if (boardResult.error || attachmentResult.error) return safeError();
  const board = boardRowSchema.safeParse(boardResult.data);
  if (!board.success) return safeError();

  if (attachmentResult.data === null) {
    const imageUrl = boardImageUrl(board.data.slug, input.attachmentId);
    revalidateDeletedImage(input.editorPath, board.data.slug, imageUrl);
    return { status: "deleted", boardRevision: board.data.revision };
  }

  const attachment = attachmentRowSchema.safeParse(attachmentResult.data);
  if (
    attachment.success &&
    attachment.data.state === "deleting" &&
    attachment.data.id === input.attachmentId &&
    attachment.data.owner_id === input.ownerId &&
    attachment.data.storage_path === input.storagePath
  ) {
    return safeError(board.data.revision);
  }

  return safeError();
}

export async function deleteBoardImage(input: {
  boardId: string;
  attachmentId: string;
}): Promise<DeleteBoardImageResult> {
  const parsed = deleteImageInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "이미지를 삭제하지 못했습니다." };
  }

  const { boardId, attachmentId } = parsed.data;
  const editorPath = `/boards/${boardId}/edit`;
  const user = await requireUser(editorPath);
  const supabase = await createServerSupabaseClient();

  let boardResult;
  let attachmentResult;
  try {
    [boardResult, attachmentResult] = await Promise.all([
      supabase
        .from("boards")
        .select("slug, content_markdown, revision")
        .eq("id", boardId)
        .eq("owner_id", user.id)
        .maybeSingle(),
      supabase
        .from("attachments")
        .select("id, owner_id, storage_path, state")
        .eq("id", attachmentId)
        .eq("board_id", boardId)
        .eq("owner_id", user.id)
        .in("state", ["ready", "deleting"])
        .maybeSingle(),
    ]);
  } catch {
    return safeError();
  }

  if (boardResult.error || attachmentResult.error) return safeError();
  const board = boardRowSchema.safeParse(boardResult.data);
  const attachment = attachmentRowSchema.safeParse(attachmentResult.data);
  if (!board.success || !attachment.success) return safeError();

  const imageUrl = boardImageUrl(board.data.slug, attachmentId);
  if (hasBoardImageReference(board.data.content_markdown, imageUrl)) {
    return {
      status: "in_use",
      message: "본문에서 이 이미지를 먼저 제거하고 저장해 주세요.",
    };
  }

  let claimResult;
  try {
    claimResult = await supabase.rpc("claim_board_image_deletion", {
      p_board_id: boardId,
      p_attachment_id: attachmentId,
      p_board_revision: board.data.revision,
    });
  } catch {
    return recoverAmbiguousClaim(supabase, {
      boardId,
      attachmentId,
      ownerId: user.id,
      storagePath: attachment.data.storage_path,
      editorPath,
    });
  }

  if (claimResult.error) {
    return recoverAmbiguousClaim(supabase, {
      boardId,
      attachmentId,
      ownerId: user.id,
      storagePath: attachment.data.storage_path,
      editorPath,
    });
  }
  const claims = z
    .array(deletionClaimSchema)
    .length(1)
    .safeParse(claimResult.data);
  const claim = claims.success ? claims.data[0] : undefined;
  if (
    !claim ||
    claim.id !== attachmentId ||
    claim.owner_id !== user.id ||
    claim.storage_path !== attachment.data.storage_path
  ) {
    return recoverAmbiguousClaim(supabase, {
      boardId,
      attachmentId,
      ownerId: user.id,
      storagePath: attachment.data.storage_path,
      editorPath,
    });
  }

  let adminClient;
  try {
    adminClient = createAdminSupabaseClient();
  } catch {
    return safeError(claim.board_revision);
  }
  let removeResult;
  try {
    removeResult = await adminClient.storage
      .from(IMAGE_BUCKET)
      .remove([claim.storage_path]);
  } catch {
    return safeError(claim.board_revision);
  }

  if (
    removeResult.error &&
    !isMissingStorageObjectError(removeResult.error)
  ) {
    return safeError(claim.board_revision);
  }

  let completeResult;
  try {
    completeResult = await adminClient.rpc(
      "complete_board_image_deletion",
      {
        p_owner_id: user.id,
        p_board_id: boardId,
        p_attachment_id: attachmentId,
      },
    );
  } catch {
    return safeError(claim.board_revision);
  }
  if (completeResult.error) return safeError(claim.board_revision);

  let storageBytes: number | undefined;
  try {
    const profileResult = await supabase
      .from("profiles")
      .select("storage_bytes")
      .eq("id", user.id)
      .single();
    const usage = storageUsageSchema.safeParse(profileResult.data);
    if (!profileResult.error && usage.success) {
      storageBytes = usage.data.storage_bytes;
    }
  } catch {
    storageBytes = undefined;
  }

  revalidateDeletedImage(editorPath, board.data.slug, imageUrl);

  return {
    status: "deleted",
    ...(storageBytes === undefined ? {} : { storageBytes }),
    boardRevision: claim.board_revision,
  };
}
