# Magic Link PKCE Callback Design

## Problem

Magic-link emails are delivered, but clicking a link does not create an
application session. The hosted Supabase project uses the default Magic Link
email template. With the server-side PKCE flow, Supabase verifies that link and
redirects to the `emailRedirectTo` URL with an authorization `code`.

The application currently sets `emailRedirectTo` directly to the post-login
destination, such as `/dashboard`. That page never exchanges the authorization
code, so the visitor remains anonymous and is redirected back to `/login`.
Unit and live E2E coverage missed the fault because they verify `/auth/confirm`
with a generated token hash directly rather than following the hosted email
template.

## Chosen Approach

Use the existing server-side PKCE callback for both Google OAuth and email magic
links. Both actions pass the exact `/auth/callback` URL under
`NEXT_PUBLIC_APP_URL`, matching the hosted redirect allowlist without query
parameters. The validated internal destination is stored separately in a
short-lived, callback-path-only `HttpOnly` cookie.

After Supabase verifies the email link, it redirects to `/auth/callback` with a
short-lived authorization code. The callback exchanges that code through
`exchangeCodeForSession`, writes the session cookies through the request-scoped
SSR client, and redirects to the validated `next` path. `shouldCreateUser: true`
continues to support both first-time signup and returning-user login.

The callback consumes and clears the destination cookie after either success or
failure. It retains validated `next` query support for links already in flight.
The hosted Supabase redirect allowlist already contains both local and
production `/auth/callback` URLs, so this change requires no remote mutation or
custom SMTP/template configuration.

## Components and Data Flow

1. The login form submits an email and optional internal `next` path.
2. `requestMagicLink` validates the email and normalizes `next` with
   `safeNextPath`.
3. The action calls `signInWithOtp` with account creation enabled and the exact
   allowlisted callback URL, then stores the validated `next` value for ten
   minutes in an `HttpOnly`, `SameSite=Lax`, callback-path-only cookie.
4. Supabase sends its default Magic Link email.
5. The user follows the link; Supabase verifies it and redirects to the callback
   with `code` while the browser retains the PKCE verifier cookie created during
   the original request.
6. `/auth/callback` exchanges `code` for a session, validates the remembered
   destination again, clears its single-use cookie, and redirects. The
   destination defaults to `/dashboard` and cannot be an external URL.

## Error Handling and Security

- Invalid emails are rejected before contacting Supabase.
- Rate-limit and provider failures retain the existing stable Korean messages.
- Missing or rejected authorization codes redirect to
  `/login?error=callback` without exposing provider details.
- All post-login destinations continue through `safeNextPath`, preventing open
  redirects.
- The destination cookie expires after ten minutes, is unavailable to browser
  scripts, and is sent only to `/auth/callback`.
- No access token, refresh token, authorization code, or provider error is
  logged or exposed.

## Testing

- Update the action regression test first so it expects the exact
  `/auth/callback` URL and a hardened destination cookie; confirm it fails
  against the direct-dashboard implementation.
- Add coverage proving an external `next` value is replaced with the safe
  dashboard default before it is stored.
- Add a cookie-aware callback test proving the remembered destination is used
  and cleared after code exchange.
- Generalize the callback test description from Google-only to PKCE callbacks;
  its existing success and failure cases cover the shared code exchange.
- Run the focused auth tests, the complete Vitest suite, lint, type checking,
  production build, secret scanner, and Playwright E2E tests.
- Run the live hosted authentication setup, which verifies the token-hash route,
  as a regression check for the existing custom confirmation endpoint. The
  actual emailed default-template hop is verified by the action callback URL and
  hosted configuration evidence because automated inbox access is unavailable.

## Documentation

Update the hosted authentication instructions to describe the default-template
PKCE callback as the supported production path. Keep `/auth/confirm` documented
as the token-hash endpoint used by controlled live tests and optional custom
templates, but do not present custom SMTP/template editing as required for
ordinary magic-link signup or login.
