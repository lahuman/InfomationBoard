# InformationBoard Remote Supabase and Authentication Design

**Date:** 2026-07-28

**Status:** Approved for written-spec review

**Phase:** 2 of the InformationBoard delivery roadmap

## 1. Objective

Phase 2 establishes the hosted Supabase database and authentication boundary
needed by all later board, publishing, and attachment work. It adds:

- version-controlled database migrations;
- owner-scoped Row Level Security;
- browser, server, and elevated server-only Supabase clients;
- email magic-link and Google OAuth login;
- cookie-based SSR sessions;
- a protected dashboard shell.

This phase uses the user's existing Supabase Free project. No local Supabase
stack or Docker runtime is used.

## 2. Environment Strategy

The existing hosted Supabase project serves as both the development environment
and the free beta environment.

The project is currently empty. The first successful migration application to
that empty project is the phase's clean-database migration proof. After real
beta users are admitted, destructive database verification is forbidden.

The following rules apply:

- Never run `supabase db reset --linked` against the hosted project.
- Make schema changes only through forward-only SQL files in
  `supabase/migrations/`.
- Do not make untracked schema changes in the Supabase Dashboard SQL editor.
- Run database policy tests inside transactions and roll back all fixtures.
- Stop remote fixture-based integration tests after real customer data exists.
- Use non-destructive migration listing, linting, and application checks after
  the project becomes customer-facing.

The repository is configured with these ignored local variables:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

CLI access tokens and the database password must be stored in the CLI credential
store or ignored local environment files. They must not be pasted into source,
tests, documentation, command output, or chat.

## 3. Supabase Client Boundaries

The application uses the current Supabase publishable and secret API keys,
rather than the legacy `anon` and `service_role` keys.

### Browser client

The browser client uses `@supabase/ssr` with:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
- the current user's cookie-backed session.

It can access only operations permitted by PostgreSQL RLS.

### Server client

Server Components, Server Actions, Route Handlers, and the Next.js Proxy create
a new request-scoped client using the publishable key and request cookies. A
client containing user state must never be cached at module scope.

Authorization checks use `supabase.auth.getClaims()`. Server authorization must
not trust the user object returned by `getSession()`.

### Elevated server-only client

The secret-key client:

- imports `server-only`;
- reads `SUPABASE_SECRET_KEY`;
- is never imported by Client Components;
- is created only inside server-side operations that have already performed
  their own authorization;
- is not used for ordinary dashboard queries.

The secret key bypasses RLS. Phase 2 adds the boundary and leakage tests, but
does not add an elevated business operation merely to exercise the client.

## 4. Database Model

All identifiers use `uuid` and all timestamps use `timestamptz`.

### `public.profiles`

- `id uuid primary key references auth.users(id) on delete cascade`
- `display_name text`
- `storage_bytes bigint not null default 0`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- `storage_bytes >= 0`
- trimmed `display_name` is empty or at most 80 characters

A security-definer trigger creates one profile after a new `auth.users` row is
inserted. The trigger function uses a fixed empty `search_path`, schema-qualified
relations, and derives the initial display name from trusted Auth metadata or
the email local part. Trigger failure must prevent a partially provisioned
account.

### `public.boards`

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `slug text not null unique`
- `title text not null default ''`
- `summary text not null default ''`
- `content_markdown text not null default ''`
- `template text not null`
- `theme jsonb not null default '{}'::jsonb`
- `visibility text not null default 'private'`
- `status text not null default 'draft'`
- `allow_indexing boolean not null default false`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `published_at timestamptz`

Constraints:

- `template in ('store', 'event', 'meeting')`
- `visibility in ('public', 'password', 'private')`
- `status in ('draft', 'published')`
- slug uses lowercase ASCII letters, digits, and hyphens
- title is at most 120 characters
- summary is at most 300 characters
- a draft has no `published_at`; a published board has `published_at`
- indexing can be enabled only for a public, published board

Phase 2 does not expose public visitor reads even when a row contains a future
public visibility value. Visitor read policies are introduced with publishing
in Phase 4.

### `public.attachments`

- `id uuid primary key default gen_random_uuid()`
- `board_id uuid not null references public.boards(id) on delete cascade`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `storage_path text not null unique`
- `original_filename text not null`
- `mime_type text not null`
- `size_bytes bigint not null`
- `state text not null default 'reserved'`
- `reservation_expires_at timestamptz`
- `created_at timestamptz not null default now()`

Constraints:

- `size_bytes > 0 and size_bytes <= 10485760`
- `state in ('reserved', 'ready')`
- a reserved row has an expiry and a ready row does not

Upload reservation, MIME verification, quotas, and Storage policies are Phase 5
behavior. Phase 2 establishes only the relational boundary and owner-only RLS.

### `private.board_secrets`

- `board_id uuid primary key references public.boards(id) on delete cascade`
- `password_hash text not null`
- `updated_at timestamptz not null default now()`

The `private` schema is not exposed through the Data API. No access is granted
to `anon` or `authenticated`.

### `private.access_attempts`

- `board_id uuid not null references public.boards(id) on delete cascade`
- `anonymous_key_hash text not null`
- `failed_count integer not null default 0`
- `window_started_at timestamptz not null`
- `locked_until timestamptz`
- primary key on `(board_id, anonymous_key_hash)`

The table is server-only and reserved for Phase 4 password access control.

## 5. Row Level Security

RLS is enabled and forced on `profiles`, `boards`, and `attachments`.

Policies permit:

- a user to select and update only their own profile;
- a user to select, insert, update, and delete only boards whose
  `owner_id = auth.uid()`;
- a user to select, insert, update, and delete only attachment metadata whose
  `owner_id = auth.uid()` and whose board is owned by the same user.

Policies do not permit:

- anonymous reads or writes;
- cross-user reads or mutations;
- profile ID or board owner reassignment;
- attachment ownership that disagrees with its parent board;
- direct access to either private table.

The database, not only application code, enforces ownership consistency.

## 6. Authentication Flow

### Login screen

`/login` contains:

- an email field and “매직링크 받기” action;
- a “Google로 계속하기” action;
- neutral success and failure states;
- a link back to the landing page.

Repeated submission is disabled while a request is pending. A magic-link
request always displays the same completion copy regardless of whether the
address previously existed.

### Email magic link

The email action calls `signInWithOtp` with account creation enabled and a
redirect under the configured application origin.

Because SSR uses PKCE, the hosted Supabase Magic Link template directs users to:

`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`

`/auth/confirm` validates the token hash with `verifyOtp`, writes the session
cookies, and redirects to the validated internal `next` path or `/dashboard`.

### Google OAuth

The Google action calls `signInWithOAuth` with provider `google` and redirects
to `/auth/callback`.

The hosted Supabase project must have:

- Google provider enabled;
- the Google OAuth client ID and secret configured in the Dashboard;
- the Supabase callback URL registered in Google;
- `http://localhost:3000/auth/callback` in the hosted redirect allowlist during
  development.

`/auth/callback` exchanges the returned authorization code with
`exchangeCodeForSession` and redirects to the validated internal `next` path or
`/dashboard`.

### Session and route protection

The existing Next.js `src/proxy.ts` keeps its CSP nonce behavior and delegates
cookie/session refresh to a focused Supabase proxy helper. The helper calls
`getClaims()` and mirrors changed cookies onto both the request and response.
Responses that set authentication cookies apply private, no-store cache
headers.

`/dashboard` performs its own server-side `getClaims()` check. Missing or
invalid claims redirect to `/login?next=/dashboard`. The page displays a safe
account identity, an empty-board state, and a sign-out action. Board creation
and querying begin in Phase 3.

Sign-out uses a server action, clears the Supabase session, and redirects to
the landing page.

## 7. Redirect and Error Handling

A shared redirect parser accepts only a path that:

- begins with exactly one `/`;
- does not begin with `//`;
- contains no scheme or host;
- falls back to `/dashboard` when invalid.

Raw Supabase errors, SQL messages, keys, tokens, and user enumeration signals
are never shown in the interface.

User-facing states include:

- magic link requested;
- request temporarily limited;
- Google login unavailable;
- expired or invalid authentication link;
- authentication callback failed;
- network request failed with retry guidance.

Callback failures return to `/login` with a stable, non-sensitive error code.

## 8. Verification

### Unit and component tests

Tests cover:

- environment parsing and missing-key failure;
- server-only client import boundaries;
- redirect validation, including absolute URLs, protocol-relative URLs, and
  encoded edge cases;
- login form states and accessible labels;
- mapping Supabase failures to stable Korean messages;
- dashboard protection and sign-out behavior;
- merging session cookies with the existing CSP response.

### Database policy tests

Version-controlled pgTAP tests run against the linked hosted project before it
contains real customer data. Each test runs in a transaction and rolls back its
fixtures.

Tests prove:

- a profile is created for a new Auth user;
- an owner can access their profile, board, and attachment metadata;
- another authenticated user cannot read or mutate those rows;
- an anonymous role cannot access the rows;
- owner IDs cannot be reassigned;
- attachment ownership must match the parent board;
- `anon` and `authenticated` cannot use the private schema.

### Migration and build checks

The phase records:

- successful first application of migrations to the empty hosted project;
- `supabase migration list` agreement;
- database lint results;
- passing application lint, type checking, unit/component tests, E2E tests, and
  production build;
- a built-output scan proving the configured secret-key value does not occur in
  client artifacts.

Playwright covers the public login page and unauthenticated dashboard redirect.
Automated live magic-link and Google-provider completion is not required in CI
because it depends on external inbox and Google interaction. Callback behavior
is covered with route-level tests, followed by one manual hosted-provider smoke
test during Phase 2 verification.

## 9. Out of Scope

Phase 2 does not implement:

- board creation, editing, autosave, import, or export;
- public board reads or QR codes;
- password verification or access cookies;
- attachment upload or Storage policies;
- quota reservation;
- payments, analytics, or administration screens;
- production Vercel deployment.

Those capabilities remain assigned to later roadmap phases.

## 10. Acceptance Criteria

Phase 2 is complete when:

- the initial migration applies to the empty hosted Supabase project;
- all exposed tables have tested owner-only RLS;
- private tables cannot be accessed through public application roles;
- email magic-link and Google OAuth entry points are configured;
- callbacks establish cookie-backed SSR sessions;
- unauthenticated dashboard access redirects to login;
- sign-out clears the session;
- the dashboard shell renders for an authenticated user;
- application verification and database lint pass;
- the configured secret key is absent from client build artifacts;
- no destructive remote database command has been used.
