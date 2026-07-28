import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env/public";
import { buildContentSecurityPolicy } from "@/lib/security/policy";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(randomUUID()).toString("base64");
  const supabaseOrigin = new URL(
    getPublicEnv().NEXT_PUBLIC_SUPABASE_URL,
  ).origin;
  const contentSecurityPolicy = buildContentSecurityPolicy(
    nonce,
    supabaseOrigin,
  );
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = await updateSupabaseSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
