import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;

  if (error || !id) {
    redirect("/login?next=%2Fdashboard");
  }

  return {
    id,
    email:
      typeof data.claims.email === "string" ? data.claims.email : null,
  };
}
