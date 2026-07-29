"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cancelBoardImageReservation } from "../storage";

const cancelBoardImageInputSchema = z
  .object({
    boardId: z.uuid(),
    attachmentId: z.uuid(),
  })
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

  await requireUser(`/boards/${parsed.data.boardId}/edit`);
  const supabase = await createServerSupabaseClient();

  const cleanup = await cancelBoardImageReservation(
    parsed.data.boardId,
    parsed.data.attachmentId,
    supabase,
  );
  if (!cleanup.ok) {
    return { status: "error", message: ERROR_MESSAGE };
  }

  return { status: "cancelled" };
}
