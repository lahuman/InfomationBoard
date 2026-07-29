"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/require-user";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { IMAGE_BUCKET } from "../model";
import { isMissingStorageObjectError } from "../storage";

const cancelBoardImageInputSchema = z
  .object({
    boardId: z.uuid(),
    attachmentId: z.uuid(),
  })
  .strict();

const ownedReservationSchema = z
  .object({ storage_path: z.string().min(1) })
  .strict();

const ERROR_MESSAGE =
  "업로드를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export type CancelBoardImageInput = {
  boardId: string;
  attachmentId: string;
};

export type CancelBoardImageResult =
  | { status: "cancelled" }
  | { status: "error"; message: string };

function isAlreadyCancelled(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return record.code === "P0001" && record.message === "image_not_found";
}

export async function cancelBoardImage(
  input: CancelBoardImageInput,
): Promise<CancelBoardImageResult> {
  const parsed = cancelBoardImageInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: "취소할 업로드 정보를 확인해 주세요.",
    };
  }

  const user = await requireUser(`/boards/${parsed.data.boardId}/edit`);
  const supabase = await createServerSupabaseClient();

  let reservationResult;
  try {
    reservationResult = await supabase
      .from("attachments")
      .select("storage_path")
      .eq("id", parsed.data.attachmentId)
      .eq("board_id", parsed.data.boardId)
      .eq("owner_id", user.id)
      .eq("state", "reserved")
      .maybeSingle();
  } catch {
    return { status: "error", message: ERROR_MESSAGE };
  }

  const reservation = ownedReservationSchema.safeParse(
    reservationResult.data,
  );
  if (reservationResult.error || !reservation.success) {
    return { status: "error", message: ERROR_MESSAGE };
  }

  let removeResult;
  try {
    removeResult = await createAdminSupabaseClient()
      .storage.from(IMAGE_BUCKET)
      .remove([reservation.data.storage_path]);
  } catch {
    return { status: "error", message: ERROR_MESSAGE };
  }
  if (
    removeResult.error &&
    !isMissingStorageObjectError(removeResult.error)
  ) {
    return { status: "error", message: ERROR_MESSAGE };
  }

  let cancelResult;
  try {
    cancelResult = await supabase.rpc("cancel_board_image", {
      p_attachment_id: parsed.data.attachmentId,
    });
  } catch {
    return { status: "error", message: ERROR_MESSAGE };
  }

  if (cancelResult.error && !isAlreadyCancelled(cancelResult.error)) {
    return { status: "error", message: ERROR_MESSAGE };
  }

  return { status: "cancelled" };
}
