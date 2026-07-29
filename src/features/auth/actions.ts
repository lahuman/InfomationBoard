"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerEnv } from "@/lib/env/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authErrorMessage } from "./messages";
import { safeNextPath } from "./redirect";

export type AuthActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const emailSchema = z.email();

function authCallbackUrl(appUrl: string, next: string) {
  const callbackUrl = new URL("/auth/callback", appUrl);
  callbackUrl.searchParams.set("next", next);
  return callbackUrl.toString();
}

export async function requestMagicLink(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsedEmail = emailSchema.safeParse(
    String(formData.get("email") ?? "").trim(),
  );
  if (!parsedEmail.success) {
    return {
      status: "error",
      message: "이메일 주소를 확인해 주세요.",
    };
  }

  const next = safeNextPath(String(formData.get("next") ?? ""));
  const env = getServerEnv();
  const supabase = await createServerSupabaseClient();
  let error: { status?: number } | null;
  try {
    ({ error } = await supabase.auth.signInWithOtp({
      email: parsedEmail.data,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: authCallbackUrl(env.NEXT_PUBLIC_APP_URL, next),
      },
    }));
  } catch {
    return {
      status: "error",
      message: authErrorMessage("network"),
    };
  }

  if (error) {
    return {
      status: "error",
      message: authErrorMessage(error.status === 429 ? "rate_limit" : "email"),
    };
  }

  return {
    status: "success",
    message:
      "입력한 주소로 로그인 링크를 보냈습니다. 이메일을 확인해 주세요.",
  };
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const env = getServerEnv();
  const callbackUrl = authCallbackUrl(env.NEXT_PUBLIC_APP_URL, next);

  const supabase = await createServerSupabaseClient();
  let result: Awaited<ReturnType<typeof supabase.auth.signInWithOAuth>>;
  try {
    result = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
      },
    });
  } catch {
    return redirect("/login?error=google");
  }

  if (result.error || !result.data.url) {
    return redirect("/login?error=google");
  }

  return redirect(result.data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/");
}
