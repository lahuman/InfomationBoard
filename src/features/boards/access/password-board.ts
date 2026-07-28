import "server-only";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { boardTemplateSchema, boardThemeSchema } from "../schema";
import type { PublicBoard } from "../public/public-board";

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const passwordBoardRowSchema = z
  .object({
    board_id: z.uuid(),
    slug: slugSchema,
    title: z.string(),
    summary: z.string(),
    content_markdown: z.string(),
    template: boardTemplateSchema,
    theme: boardThemeSchema,
    updated_at: z.string(),
    published_at: z.string(),
    password_hash: z.string().startsWith("$argon2id$"),
    secret_version: z.string(),
  })
  .strict();

export type PasswordBoard = {
  board: PublicBoard;
  passwordHash: string;
  secretVersion: string;
};

export async function getPasswordBoardBySlug(
  slug: string,
): Promise<PasswordBoard | null> {
  if (!slugSchema.safeParse(slug).success) return null;

  const { data, error } = await createAdminSupabaseClient().rpc(
    "get_password_board_for_server",
    { p_slug: slug },
  );
  const parsed = passwordBoardRowSchema.safeParse(data?.[0]);
  if (error || !parsed.success) return null;

  return {
    board: {
      id: parsed.data.board_id,
      slug: parsed.data.slug,
      title: parsed.data.title,
      summary: parsed.data.summary,
      contentMarkdown: parsed.data.content_markdown,
      template: parsed.data.template,
      theme: parsed.data.theme,
      allowIndexing: false,
      updatedAt: parsed.data.updated_at,
      publishedAt: parsed.data.published_at,
    },
    passwordHash: parsed.data.password_hash,
    secretVersion: parsed.data.secret_version,
  };
}
