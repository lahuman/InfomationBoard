import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPublicEnv } from "@/lib/env/public";
import type { Database } from "./database.types";

export async function updateSupabaseSession(
  request: NextRequest,
  requestHeaders: Headers,
): Promise<NextResponse> {
  const env = getPublicEnv();
  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          response.headers.set("Cache-Control", "private, no-store");
        },
      },
    },
  );

  await supabase.auth.getClaims();
  return response;
}
