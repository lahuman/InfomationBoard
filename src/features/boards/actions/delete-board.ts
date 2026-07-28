"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const deleteBoardInputSchema = z.object({ id: z.uuid() }).strict();
const DELETE_ERROR_MESSAGE =
  "안내판을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export type DeleteBoardResult =
  | { status: "deleted" }
  | { status: "error"; message: string };

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

  let result;
  try {
    result = await supabase
      .from("boards")
      .delete()
      .eq("id", parsed.data.id)
      .eq("owner_id", user.id);
  } catch {
    return {
      status: "error",
      message: DELETE_ERROR_MESSAGE,
    };
  }

  if (result.error) {
    return {
      status: "error",
      message: DELETE_ERROR_MESSAGE,
    };
  }

  revalidatePath("/dashboard");
  return { status: "deleted" };
}
