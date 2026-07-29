export const AUTH_NEXT_COOKIE_NAME = "informationboard-auth-next";
export const AUTH_NEXT_COOKIE_MAX_AGE_SECONDS = 10 * 60;

export function authNextCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    maxAge: AUTH_NEXT_COOKIE_MAX_AGE_SECONDS,
    path: "/auth/callback",
    sameSite: "lax" as const,
    secure,
  };
}
