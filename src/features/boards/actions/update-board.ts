"use server";

import { requireUser } from "@/features/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapEditorBoardRow, type EditorBoard } from "../editor/editor-board";
import { updateBoardInputSchema, type UpdateBoardInput } from "../schema";

export type UpdateBoardResult =
  | {
      status: "saved";
      revision: number;
      updatedAt: string;
    }
  | {
      status: "conflict";
      serverBoard: EditorBoard;
    }
  | {
      status: "not_found" | "error";
      message: string;
    };

export async function updateBoard(
  input: UpdateBoardInput,
): Promise<UpdateBoardResult> {
  const parsed = updateBoardInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: "저장할 내용을 확인해 주세요.",
    };
  }

  const editorPath = `/boards/${parsed.data.id}/edit`;
  const user = await requireUser(editorPath);
  const supabase = await createServerSupabaseClient();

  let updateResult;
  try {
    updateResult = await supabase
      .from("boards")
      .update({
        title: parsed.data.title,
        summary: parsed.data.summary,
        content_markdown: parsed.data.contentMarkdown,
        theme: parsed.data.theme,
      })
      .eq("id", parsed.data.id)
      .eq("owner_id", user.id)
      .eq("revision", parsed.data.revision)
      .select("revision, updated_at")
      .maybeSingle();
  } catch {
    return {
      status: "error",
      message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (updateResult.error) {
    return {
      status: "error",
      message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (updateResult.data) {
    return {
      status: "saved",
      revision: updateResult.data.revision,
      updatedAt: updateResult.data.updated_at,
    };
  }

  let currentResult;
  try {
    currentResult = await supabase
      .from("boards")
      .select(
        "id, slug, title, summary, content_markdown, template, theme, revision, updated_at, status, visibility, allow_indexing, published_at",
      )
      .eq("id", parsed.data.id)
      .eq("owner_id", user.id)
      .maybeSingle();
  } catch {
    return {
      status: "error",
      message: "저장 상태를 확인하지 못했습니다.",
    };
  }

  if (currentResult.error) {
    return {
      status: "error",
      message: "저장 상태를 확인하지 못했습니다.",
    };
  }

  const serverBoard = mapEditorBoardRow(currentResult.data);
  if (!serverBoard) {
    return {
      status: "not_found",
      message: "안내판을 찾을 수 없습니다.",
    };
  }

  return {
    status: "conflict",
    serverBoard,
  };
}
