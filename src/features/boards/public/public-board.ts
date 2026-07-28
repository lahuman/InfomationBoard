import { z } from "zod";
import { boardTemplateSchema, boardThemeSchema } from "../schema";

export type PublicBoard = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  contentMarkdown: string;
  template: z.infer<typeof boardTemplateSchema>;
  theme: z.infer<typeof boardThemeSchema>;
  allowIndexing: boolean;
  updatedAt: string;
  publishedAt: string;
};

const publicBoardRowSchema = z
  .object({
    id: z.uuid(),
    slug: z.string().min(1),
    title: z.string(),
    summary: z.string(),
    content_markdown: z.string(),
    template: boardTemplateSchema,
    theme: boardThemeSchema,
    allow_indexing: z.boolean(),
    updated_at: z.string(),
    published_at: z.string(),
  })
  .strict();

export function mapPublicBoardRow(input: unknown): PublicBoard | null {
  const parsed = publicBoardRowSchema.safeParse(input);
  if (!parsed.success) return null;

  return {
    id: parsed.data.id,
    slug: parsed.data.slug,
    title: parsed.data.title,
    summary: parsed.data.summary,
    contentMarkdown: parsed.data.content_markdown,
    template: parsed.data.template,
    theme: parsed.data.theme,
    allowIndexing: parsed.data.allow_indexing,
    updatedAt: parsed.data.updated_at,
    publishedAt: parsed.data.published_at,
  };
}
