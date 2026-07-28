import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { safeNextPath } from "@/features/auth/redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function callbackFailure(request: NextRequest) {
  return NextResponse.redirect(
    new URL("/login?error=callback", request.url),
  );
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return callbackFailure(request);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return callbackFailure(request);

  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  return NextResponse.redirect(new URL(next, request.url));
}
