import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { safeNextPath } from "@/features/auth/redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const supportedTypes = new Set<EmailOtpType>([
  "email",
  "signup",
  "invite",
  "recovery",
  "email_change",
]);

function confirmationFailure(request: NextRequest) {
  return NextResponse.redirect(new URL("/login?error=expired", request.url));
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (!tokenHash || !type || !supportedTypes.has(type as EmailOtpType)) {
    return confirmationFailure(request);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  });
  if (error) return confirmationFailure(request);

  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  return NextResponse.redirect(new URL(next, request.url));
}
