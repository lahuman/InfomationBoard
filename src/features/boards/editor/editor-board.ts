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
  slug: string;
  template: string;
  revision: number;
  updatedAt: string;
  status: "draft" | "published";
  visibility: "private" | "public" | "password";
  allowIndexing: boolean;
  publishedAt: string | null;
};

const editorBoardRowSchema = z
  .object({
    id: z.uuid(),
    slug: z.string().min(1),
    title: z.string(),
    summary: z.string(),
    content_markdown: z.string(),
    template: z.string(),
    theme: boardThemeSchema,
    revision: z.number().int().positive(),
    updated_at: z.string(),
    status: z.enum(["draft", "published"]),
    visibility: z.enum(["private", "public", "password"]),
    allow_indexing: z.boolean(),
    published_at: z.string().nullable(),
  })
  .strict();

export function mapEditorBoardRow(input: unknown): EditorBoard | null {
  const parsed = editorBoardRowSchema.safeParse(input);
  if (!parsed.success) return null;

  return {
    id: parsed.data.id,
    slug: parsed.data.slug,
    title: parsed.data.title,
    summary: parsed.data.summary,
    contentMarkdown: parsed.data.content_markdown,
    template: parsed.data.template,
    theme: parsed.data.theme,
    revision: parsed.data.revision,
    updatedAt: parsed.data.updated_at,
    status: parsed.data.status,
    visibility: parsed.data.visibility,
    allowIndexing: parsed.data.allow_indexing,
    publishedAt: parsed.data.published_at,
  };
}
