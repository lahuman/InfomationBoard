import "server-only";
import { z } from "zod";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { mapPublicBoardRow, type PublicBoard } from "./public-board";

const publicBoardSlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const PUBLIC_BOARD_COLUMNS =
  "id, slug, title, summary, content_markdown, template, theme, allow_indexing, updated_at, published_at";

export async function getPublicBoardBySlug(
  slug: string,
): Promise<PublicBoard | null> {
  if (!publicBoardSlugSchema.safeParse(slug).success) return null;

  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase
    .from("boards")
    .select(PUBLIC_BOARD_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  return mapPublicBoardRow(data);
}
