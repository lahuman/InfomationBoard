"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/require-user";
import { IMAGE_BUCKET } from "@/features/boards/images/model";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const deleteBoardInputSchema = z.object({ id: z.uuid() }).strict();
const DELETE_ERROR_MESSAGE =
  "안내판을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export type DeleteBoardResult =
  | { status: "deleted" }
  | { status: "error"; message: string };

const boardDeletionClaimSchema = z
  .object({
    id: z.uuid(),
    owner_id: z.uuid(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();

const attachmentPathsSchema = z.array(
  z.object({ storage_path: z.string().min(1) }).strict(),
);

export async function deleteBoard(input: {
  id: string;
}): Promise<DeleteBoardResult> {
  const parsed = deleteBoardInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: "안내판을 삭제하지 못했습니다.",
    };
  }

  const editorPath = `/boards/${parsed.data.id}/edit`;
  const user = await requireUser(editorPath);
  const supabase = await createServerSupabaseClient();

  let claimResult;
  try {
    claimResult = await supabase.rpc("claim_board_deletion", {
      p_board_id: parsed.data.id,
    });
  } catch {
    return {
      status: "error",
      message: DELETE_ERROR_MESSAGE,
    };
  }

  if (claimResult.error) {
    return {
      status: "error",
      message: DELETE_ERROR_MESSAGE,
    };
  }

  const claims = z.array(boardDeletionClaimSchema).max(1).safeParse(
    claimResult.data,
  );
  if (!claims.success) {
    return { status: "error", message: DELETE_ERROR_MESSAGE };
  }
  const claim = claims.data[0];
  if (!claim) {
    revalidatePath("/dashboard");
    return { status: "deleted" };
  }
  if (claim.id !== parsed.data.id || claim.owner_id !== user.id) {
    return { status: "error", message: DELETE_ERROR_MESSAGE };
  }

  let pathsResult;
  try {
    pathsResult = await supabase
      .from("attachments")
      .select("storage_path")
      .eq("board_id", claim.id)
      .eq("owner_id", claim.owner_id);
  } catch {
    return { status: "error", message: DELETE_ERROR_MESSAGE };
  }
  if (pathsResult.error) {
    return { status: "error", message: DELETE_ERROR_MESSAGE };
  }
  const attachmentPaths = attachmentPathsSchema.safeParse(pathsResult.data);
  if (!attachmentPaths.success) {
    return { status: "error", message: DELETE_ERROR_MESSAGE };
  }

  let adminClient;
  try {
    adminClient = createAdminSupabaseClient();
  } catch {
    return { status: "error", message: DELETE_ERROR_MESSAGE };
  }
  const paths = attachmentPaths.data.map((row) => row.storage_path);
  if (paths.length > 0) {
    let removeResult;
    try {
      removeResult = await adminClient.storage
        .from(IMAGE_BUCKET)
        .remove(paths);
    } catch {
      return { status: "error", message: DELETE_ERROR_MESSAGE };
    }
    if (removeResult.error) {
      return { status: "error", message: DELETE_ERROR_MESSAGE };
    }
  }

  let completionResult;
  try {
    completionResult = await adminClient.rpc("complete_board_deletion", {
      p_owner_id: claim.owner_id,
      p_board_id: claim.id,
    });
  } catch {
    return { status: "error", message: DELETE_ERROR_MESSAGE };
  }
  if (completionResult.error) {
    return { status: "error", message: DELETE_ERROR_MESSAGE };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/b/${claim.slug}`);
  return { status: "deleted" };
}
