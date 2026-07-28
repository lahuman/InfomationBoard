import type { BoardTheme } from "../schema";
import { boardThemeSchema } from "../schema";
import { z } from "zod";

export type EditorDraft = {
  title: string;
  summary: string;
  contentMarkdown: string;
  theme: BoardTheme;
};

export type EditorBoard = EditorDraft & {
  id: string;
  template: string;
  revision: number;
  updatedAt: string;
};

const editorBoardRowSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    summary: z.string(),
    content_markdown: z.string(),
    template: z.string(),
    theme: boardThemeSchema,
    revision: z.number().int().positive(),
    updated_at: z.string(),
  })
  .strict();

export function mapEditorBoardRow(input: unknown): EditorBoard | null {
  const parsed = editorBoardRowSchema.safeParse(input);
  if (!parsed.success) return null;

  return {
    id: parsed.data.id,
    title: parsed.data.title,
    summary: parsed.data.summary,
    contentMarkdown: parsed.data.content_markdown,
    template: parsed.data.template,
    theme: parsed.data.theme,
    revision: parsed.data.revision,
    updatedAt: parsed.data.updated_at,
  };
}

