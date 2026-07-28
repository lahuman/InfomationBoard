import "server-only";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapEditorBoardRow, type EditorBoard } from "./editor-board";

const boardIdSchema = z.uuid();

export async function getBoardForEditor(
  ownerId: string,
  boardId: string,
): Promise<EditorBoard | null> {
  if (!boardIdSchema.safeParse(boardId).success) return null;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("boards")
    .select(
      "id, title, summary, content_markdown, template, theme, revision, updated_at",
    )
    .eq("id", boardId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error || !data) return null;
  return mapEditorBoardRow(data);
}

