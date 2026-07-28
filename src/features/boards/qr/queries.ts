import "server-only";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export async function getQrBoardBySlug(
  slug: string,
): Promise<{ slug: string } | null> {
  if (!slugSchema.safeParse(slug).success) return null;

  const { data, error } = await createAdminSupabaseClient()
    .from("boards")
    .select("slug")
    .eq("slug", slug)
    .eq("status", "published")
    .in("visibility", ["public", "password"])
    .maybeSingle();
  const parsed = z.object({ slug: slugSchema }).strict().safeParse(data);
  return error || !parsed.success ? null : parsed.data;
}
