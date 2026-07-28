import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { safeNextPath } from "./redirect";

export async function requireUser(nextPath = "/dashboard") {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;

  if (error || !id) {
    const next = safeNextPath(nextPath);
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  return {
    id,
    email:
      typeof data.claims.email === "string" ? data.claims.email : null,
  };
}
