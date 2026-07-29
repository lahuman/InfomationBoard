import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { safeNextPath } from "@/features/auth/redirect";
import {
  AUTH_NEXT_COOKIE_NAME,
  authNextCookieOptions,
} from "@/features/auth/next-path-cookie";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function clearRememberedNext(response: NextResponse, request: NextRequest) {
  response.cookies.set(AUTH_NEXT_COOKIE_NAME, "", {
    ...authNextCookieOptions(request.nextUrl.protocol === "https:"),
    maxAge: 0,
  });
  return response;
}

function callbackFailure(request: NextRequest) {
  return clearRememberedNext(
    NextResponse.redirect(new URL("/login?error=callback", request.url)),
    request,
  );
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return callbackFailure(request);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return callbackFailure(request);

  const next = safeNextPath(
    request.cookies.get(AUTH_NEXT_COOKIE_NAME)?.value ??
      request.nextUrl.searchParams.get("next"),
  );
  return clearRememberedNext(
    NextResponse.redirect(new URL(next, request.url)),
    request,
  );
}
