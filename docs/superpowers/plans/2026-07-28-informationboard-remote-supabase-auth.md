# InformationBoard Remote Supabase and Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the hosted Supabase schema, owner-only RLS, SSR authentication, and protected dashboard shell for InformationBoard.

**Architecture:** The application uses request-scoped `@supabase/ssr` clients with publishable keys for all ordinary browser and server access, plus a separately guarded secret-key client for future administrative operations. Forward-only SQL migrations and transactional pgTAP tests are applied to the existing empty Supabase Free project; no local Docker stack and no destructive linked reset are used.

**Tech Stack:** Next.js 16.2.12, React 19.2.8, TypeScript 6.0.3, Supabase JS 2.110.9, Supabase SSR 0.12.3, Supabase CLI 2.110.0, PostgreSQL, pgTAP, Vitest 4.1.10, Testing Library, Playwright 1.62.0.

## Global Constraints

- Use the existing hosted Supabase Free project for development and the free beta.
- Do not start a local Supabase stack or use Docker.
- Never run `supabase db reset --linked`.
- Store schema changes only in forward-only files under `supabase/migrations/`.
- Use `sb_publishable_...` in public clients and `sb_secret_...` only in a `server-only` module.
- Never print, commit, bundle, or paste the secret key, access token, or database password.
- Use `supabase.auth.getClaims()` for server authorization; do not authorize with `getSession()`.
- Keep all user-bearing Supabase clients request-scoped.
- Keep `profiles`, `boards`, and `attachments` owner-only in Phase 2; public visitor reads begin in Phase 4.
- Run remote RLS fixtures only inside transactions that roll back.
- Stop remote fixture-based tests before admitting real beta customer data.
- Do not implement board editing, publishing, QR codes, uploads, quotas, or password verification in this phase.

---

## File Map

### Environment and clients

- `src/lib/env/schema.ts`: validate public and server Supabase configuration.
- `src/lib/env/public.ts`: expose only browser-safe configuration.
- `src/lib/env/server.ts`: expose server configuration behind `server-only`.
- `src/lib/supabase/client.ts`: create browser clients.
- `src/lib/supabase/server.ts`: create request-scoped cookie clients.
- `src/lib/supabase/admin.ts`: create elevated secret-key clients.
- `src/lib/supabase/database.types.ts`: generated database types.

### Database

- `supabase/config.toml`: project-scoped CLI configuration without secrets.
- `supabase/migrations/20260728000100_phase2_foundation.sql`: schemas, tables,
  constraints, indexes, triggers, grants, and RLS enablement.
- `supabase/migrations/20260728000200_owner_rls.sql`: explicit owner policies.
- `supabase/tests/phase2_rls.test.sql`: transactional pgTAP policy tests.

### Authentication

- `src/features/auth/redirect.ts`: validate internal post-auth paths.
- `src/features/auth/messages.ts`: map failures to stable Korean copy.
- `src/features/auth/actions.ts`: magic-link, Google, and sign-out server actions.
- `src/features/auth/login-form.tsx`: accessible interactive login form.
- `src/app/login/page.tsx`: login route.
- `src/app/auth/callback/route.ts`: Google PKCE callback.
- `src/app/auth/confirm/route.ts`: email token-hash confirmation.
- `src/lib/supabase/proxy.ts`: refresh cookies and validate claims.
- `src/proxy.ts`: compose auth refresh with the existing nonce CSP.

### Protected shell and verification

- `src/features/auth/require-user.ts`: verified dashboard identity boundary.
- `src/app/dashboard/page.tsx`: protected empty dashboard shell.
- `scripts/check-client-secret.mjs`: fail if the configured secret occurs in
  build artifacts.
- `tests/e2e/auth.spec.ts`: login and protected-route smoke tests.
- `.github/workflows/ci.yml`: dummy public configuration and secret leakage gate.
- `README.md`: hosted Supabase setup and non-destructive workflow.

---

### Task 1: Dependencies, environment validation, and client boundaries

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Modify: `src/lib/env/schema.ts`
- Modify: `src/lib/env/schema.test.ts`
- Create: `src/lib/env/public.ts`
- Modify: `src/lib/env/server.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`
- Test: `src/lib/supabase/clients.test.ts`

**Interfaces:**
- Produces: `parsePublicEnv(source): PublicEnv`
- Produces: `parseServerEnv(source): ServerEnv`
- Produces: `getPublicEnv(): PublicEnv`
- Produces: `getServerEnv(): ServerEnv`
- Produces: `createBrowserSupabaseClient()`
- Produces: `createServerSupabaseClient()`
- Produces: `createAdminSupabaseClient()`

- [ ] **Step 1: Add the pinned Supabase dependencies**

Run:

```bash
npm install --save-exact @supabase/supabase-js@2.110.9 @supabase/ssr@0.12.3
npm install --save-dev --save-exact supabase@2.110.0 @testing-library/user-event@14.6.1
```

Expected: `package.json` and `package-lock.json` contain the exact versions and
`npm audit --audit-level=high` exits 0.

- [ ] **Step 2: Write failing environment-boundary tests**

Replace `src/lib/env/schema.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { parsePublicEnv, parseServerEnv } from "./schema";

const publicSource = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000/",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co/",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

describe("parsePublicEnv", () => {
  it("normalizes the configured origins", () => {
    expect(parsePublicEnv(publicSource)).toEqual({
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    });
  });

  it("rejects legacy or missing publishable keys", () => {
    expect(() =>
      parsePublicEnv({
        ...publicSource,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "legacy-anon-key",
      }),
    ).toThrow("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });
});

describe("parseServerEnv", () => {
  it("requires a current secret key", () => {
    expect(() => parseServerEnv(publicSource)).toThrow("SUPABASE_SECRET_KEY");
  });

  it("accepts the server-only key without returning it from public parsing", () => {
    const server = parseServerEnv({
      ...publicSource,
      SUPABASE_SECRET_KEY: "sb_secret_test",
    });
    expect(server.SUPABASE_SECRET_KEY).toBe("sb_secret_test");
    expect(parsePublicEnv(publicSource)).not.toHaveProperty(
      "SUPABASE_SECRET_KEY",
    );
  });
});
```

- [ ] **Step 3: Run the environment test and verify RED**

Run:

```bash
npm run test:run -- src/lib/env/schema.test.ts
```

Expected: FAIL because `parsePublicEnv` and `parseServerEnv` do not exist.

- [ ] **Step 4: Implement split environment schemas**

Replace `src/lib/env/schema.ts` with:

```ts
import { z } from "zod";

const httpUrl = z
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "URL must use http or https",
  })
  .transform((value) => value.replace(/\/$/, ""));

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .regex(/^sb_publishable_[A-Za-z0-9_-]+$/),
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SECRET_KEY: z.string().regex(/^sb_secret_[A-Za-z0-9_-]+$/),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function formatError(error: z.ZodError): Error {
  const message = error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  return new Error(`Invalid environment: ${message}`);
}

export function parsePublicEnv(
  source: Record<string, string | undefined>,
): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) throw formatError(result.error);
  return result.data;
}

export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) throw formatError(result.error);
  return result.data;
}
```

Create `src/lib/env/public.ts`:

```ts
import { parsePublicEnv } from "./schema";

export function getPublicEnv() {
  return parsePublicEnv({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
```

Replace `src/lib/env/server.ts` with:

```ts
import "server-only";
import { cache } from "react";
import { parseServerEnv } from "./schema";

export const getServerEnv = cache(() =>
  parseServerEnv({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  }),
);
```

- [ ] **Step 5: Run the environment test and verify GREEN**

Run:

```bash
npm run test:run -- src/lib/env/schema.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6: Write failing Supabase-client boundary tests**

Create `src/lib/supabase/clients.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Supabase client boundaries", () => {
  it("keeps the secret key out of the browser client", () => {
    const source = readFileSync(
      new URL("./client.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("SUPABASE_SECRET_KEY");
    expect(source).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("marks the elevated client as server-only", () => {
    const source = readFileSync(
      new URL("./admin.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('import "server-only"');
    expect(source).toContain("SUPABASE_SECRET_KEY");
  });
});
```

- [ ] **Step 7: Run the client test and verify RED**

Run:

```bash
npm run test:run -- src/lib/supabase/clients.test.ts
```

Expected: FAIL because the client files do not exist.

- [ ] **Step 8: Implement the three client factories**

Create `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env/public";

export function createBrowserSupabaseClient() {
  const env = getPublicEnv();
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
```

Create `src/lib/supabase/server.ts`:

```ts
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env/public";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot write cookies; Proxy refresh owns writes.
          }
        },
      },
    },
  );
}
```

Create `src/lib/supabase/admin.ts`:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env/server";

export function createAdminSupabaseClient() {
  const env = getServerEnv();
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
```

Update `.env.example`:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me
SUPABASE_SECRET_KEY=sb_secret_replace_me
```

- [ ] **Step 9: Verify Task 1**

Run:

```bash
npm run test:run -- src/lib/env/schema.test.ts src/lib/supabase/clients.test.ts
npm run typecheck
npm audit --audit-level=high
```

Expected: all tests and type checking pass; audit reports no high-or-critical
vulnerabilities.

- [ ] **Step 10: Commit Task 1**

```bash
git add package.json package-lock.json .env.example src/lib/env src/lib/supabase
git commit -m "feat: establish supabase client boundaries"
```

---

### Task 2: Hosted schema migration and generated types

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/20260728000100_phase2_foundation.sql`
- Create: `src/lib/supabase/database.types.ts`
- Modify: `src/lib/supabase/client.ts`
- Modify: `src/lib/supabase/server.ts`
- Modify: `src/lib/supabase/admin.ts`

**Interfaces:**
- Produces: `public.profiles`, `public.boards`, `public.attachments`
- Produces: `private.board_secrets`, `private.access_attempts`
- Produces: generated `Database` type for all Supabase clients

- [ ] **Step 1: Initialize project-scoped CLI configuration**

Run:

```bash
npx supabase init
```

Expected: `supabase/config.toml` is created. Confirm it contains no URL, API key,
access token, or database password.

- [ ] **Step 2: Write the foundation migration**

Create `supabase/migrations/20260728000100_phase2_foundation.sql`:

```sql
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  storage_bytes bigint not null default 0 check (storage_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length
    check (display_name is null or char_length(btrim(display_name)) <= 80)
);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  slug text not null unique,
  title text not null default '',
  summary text not null default '',
  content_markdown text not null default '',
  template text not null,
  theme jsonb not null default '{}'::jsonb,
  visibility text not null default 'private',
  status text not null default 'draft',
  allow_indexing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint boards_id_owner_unique unique (id, owner_id),
  constraint boards_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint boards_title_length check (char_length(title) <= 120),
  constraint boards_summary_length check (char_length(summary) <= 300),
  constraint boards_template check (template in ('store', 'event', 'meeting')),
  constraint boards_visibility check (visibility in ('public', 'password', 'private')),
  constraint boards_status check (status in ('draft', 'published')),
  constraint boards_lifecycle check (
    (status = 'draft' and published_at is null)
    or (status = 'published' and published_at is not null)
  ),
  constraint boards_indexing check (
    not allow_indexing
    or (visibility = 'public' and status = 'published')
  )
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  owner_id uuid not null,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  state text not null default 'reserved',
  reservation_expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attachments_board_owner_fk
    foreign key (board_id, owner_id)
    references public.boards(id, owner_id)
    on delete cascade,
  constraint attachments_state check (state in ('reserved', 'ready')),
  constraint attachments_reservation_state check (
    (state = 'reserved' and reservation_expires_at is not null)
    or (state = 'ready' and reservation_expires_at is null)
  )
);

create table private.board_secrets (
  board_id uuid primary key references public.boards(id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table private.access_attempts (
  board_id uuid not null references public.boards(id) on delete cascade,
  anonymous_key_hash text not null,
  failed_count integer not null default 0 check (failed_count >= 0),
  window_started_at timestamptz not null,
  locked_until timestamptz,
  primary key (board_id, anonymous_key_hash)
);

create index boards_owner_updated_idx
  on public.boards (owner_id, updated_at desc);
create index attachments_board_created_idx
  on public.attachments (board_id, created_at);
create index attachments_owner_state_idx
  on public.attachments (owner_id, state);

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger boards_set_updated_at
before update on public.boards
for each row execute function private.set_updated_at();

create trigger board_secrets_set_updated_at
before update on private.board_secrets
for each row execute function private.set_updated_at();

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_name text;
begin
  candidate_name := nullif(
    btrim(coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))),
    ''
  );

  insert into public.profiles (id, display_name)
  values (new.id, left(candidate_name, 80));

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.boards enable row level security;
alter table public.boards force row level security;
alter table public.attachments enable row level security;
alter table public.attachments force row level security;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.boards to authenticated;
grant select, insert, update, delete on public.attachments to authenticated;
```

- [ ] **Step 3: Inspect the migration before remote application**

Run:

```bash
rg -n "reset|drop database|truncate|SUPABASE_SECRET_KEY|sb_secret_" supabase
npx supabase db lint --help
```

Expected: the migration contains none of the destructive or secret patterns.
The lint help command succeeds without starting Docker.

- [ ] **Step 4: Link the repository to the hosted project**

Derive the project reference from the hostname in
`NEXT_PUBLIC_SUPABASE_URL`, authenticate with `npx supabase login`, then run:

```bash
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
```

Expected: the CLI reports a successful link. Do not add `.supabase/` temporary
state or credential files to Git.

- [ ] **Step 5: Preview and apply the first forward migration**

Run:

```bash
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase migration list --linked
```

Expected: dry-run lists only `20260728000100_phase2_foundation.sql`; push
succeeds against the empty project; local and remote migration lists agree.
Do not run any linked reset command.

- [ ] **Step 6: Generate and wire database types**

Run:

```bash
npx supabase gen types typescript --linked
```

Save the exact output as `src/lib/supabase/database.types.ts`, then add
`<Database>` to the generic parameter of all three client factories:

```ts
import type { Database } from "./database.types";
```

Use `createBrowserClient<Database>`, `createServerClient<Database>`, and
`createClient<Database>` respectively.

- [ ] **Step 7: Verify Task 2**

Run:

```bash
npx supabase migration list --linked
npx supabase db lint --linked --level error --fail-on error
npm run typecheck
npm run test:run
```

Expected: migration state agrees, database lint exits 0, and application checks
pass.

- [ ] **Step 8: Commit Task 2**

```bash
git add supabase src/lib/supabase
git commit -m "feat: add hosted supabase schema"
```

---

### Task 3: Owner-only RLS and transactional policy tests

**Files:**
- Create: `supabase/migrations/20260728000200_owner_rls.sql`
- Create: `supabase/tests/phase2_rls.test.sql`

**Interfaces:**
- Consumes: Phase 2 tables from Task 2
- Produces: owner-only CRUD policies for all public tables
- Produces: transactional pgTAP proof for owner, second user, and anonymous roles

- [ ] **Step 1: Write the policy migration**

Create `supabase/migrations/20260728000200_owner_rls.sql`:

```sql
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy boards_select_own
on public.boards
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy boards_insert_own
on public.boards
for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy boards_update_own
on public.boards
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy boards_delete_own
on public.boards
for delete
to authenticated
using (owner_id = (select auth.uid()));

create policy attachments_select_own
on public.attachments
for select
to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.boards
    where boards.id = attachments.board_id
      and boards.owner_id = (select auth.uid())
  )
);

create policy attachments_insert_own
on public.attachments
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.boards
    where boards.id = attachments.board_id
      and boards.owner_id = (select auth.uid())
  )
);

create policy attachments_update_own
on public.attachments
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.boards
    where boards.id = attachments.board_id
      and boards.owner_id = (select auth.uid())
  )
);

create policy attachments_delete_own
on public.attachments
for delete
to authenticated
using (owner_id = (select auth.uid()));
```

- [ ] **Step 2: Write the pgTAP policy test before applying policies**

Create `supabase/tests/phase2_rls.test.sql` with one transaction:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'owner@example.test', '',
  now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Owner"}',
  now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '20000000-0000-0000-0000-000000000002',
  'authenticated', 'authenticated', 'other@example.test', '',
  now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Other"}',
  now(), now()
);

select results_eq(
  $$ select count(*)::bigint from public.profiles
     where id in (
       '10000000-0000-0000-0000-000000000001',
       '20000000-0000-0000-0000-000000000002'
     ) $$,
  array[2::bigint],
  'auth trigger creates profiles'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select lives_ok(
  $$ insert into public.boards (
       id, owner_id, slug, title, template
     ) values (
       '30000000-0000-0000-0000-000000000003',
       '10000000-0000-0000-0000-000000000001',
       'owner-board', 'Owner board', 'event'
     ) $$,
  'owner can insert a board'
);

select results_eq(
  $$ select count(*)::bigint from public.boards $$,
  array[1::bigint],
  'owner can select the board'
);

select lives_ok(
  $$ insert into public.attachments (
       board_id, owner_id, storage_path, original_filename,
       mime_type, size_bytes, reservation_expires_at
     ) values (
       '30000000-0000-0000-0000-000000000003',
       '10000000-0000-0000-0000-000000000001',
       'owner/random-file', 'guide.pdf',
       'application/pdf', 1024, now() + interval '15 minutes'
     ) $$,
  'owner can insert attachment metadata'
);

select results_eq(
  $$ select count(*)::bigint from public.attachments $$,
  array[1::bigint],
  'owner can select attachment metadata'
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);

select results_eq(
  $$ select count(*)::bigint from public.boards $$,
  array[0::bigint],
  'another user cannot read the board'
);

select results_eq(
  $$ select count(*)::bigint from public.attachments $$,
  array[0::bigint],
  'another user cannot read the attachment'
);

select throws_ok(
  $$ insert into public.boards (
       owner_id, slug, title, template
     ) values (
       '10000000-0000-0000-0000-000000000001',
       'forged-board', 'Forged', 'meeting'
     ) $$,
  '42501',
  null,
  'another user cannot insert for the owner'
);

select throws_ok(
  $$ insert into public.attachments (
       board_id, owner_id, storage_path, original_filename,
       mime_type, size_bytes, reservation_expires_at
     ) values (
       '30000000-0000-0000-0000-000000000003',
       '20000000-0000-0000-0000-000000000002',
       'other/forged-file', 'forged.pdf',
       'application/pdf', 1024, now() + interval '15 minutes'
     ) $$,
  '23503',
  null,
  'attachment owner must match its board owner'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select results_eq(
  $$ select count(*)::bigint from public.boards $$,
  array[0::bigint],
  'anonymous users cannot read boards'
);

reset role;
select hasnt_schema_privilege(
  'authenticated',
  'private',
  'USAGE',
  'authenticated cannot use the private schema'
);
select hasnt_schema_privilege(
  'anon',
  'private',
  'USAGE',
  'anonymous users cannot use the private schema'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Verify RED against the linked project**

Run:

```bash
npx supabase test db --linked supabase/tests/phase2_rls.test.sql
```

Expected: policy-dependent assertions fail because the owner policies have not
been applied.

- [ ] **Step 4: Preview and apply the policy migration**

Run:

```bash
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

Expected: only `20260728000200_owner_rls.sql` is pending, then applies
successfully.

- [ ] **Step 5: Verify GREEN and rollback behavior**

Run twice:

```bash
npx supabase test db --linked supabase/tests/phase2_rls.test.sql
npx supabase test db --linked supabase/tests/phase2_rls.test.sql
```

Expected: 12 assertions pass both times. The second pass proves fixture rows
were rolled back after the first run.

- [ ] **Step 6: Regenerate types and verify Task 3**

Regenerate `src/lib/supabase/database.types.ts`, then run:

```bash
npx supabase migration list --linked
npx supabase db lint --linked --level error --fail-on error
npm run typecheck
```

Expected: migration lists agree, lint exits 0, and generated types compile.

- [ ] **Step 7: Commit Task 3**

```bash
git add supabase src/lib/supabase/database.types.ts
git commit -m "security: enforce owner row policies"
```

---

### Task 4: Redirect safety and login experience

**Files:**
- Create: `src/features/auth/redirect.ts`
- Test: `src/features/auth/redirect.test.ts`
- Create: `src/features/auth/messages.ts`
- Test: `src/features/auth/messages.test.ts`
- Create: `src/features/auth/actions.ts`
- Test: `src/features/auth/actions.test.ts`
- Create: `src/features/auth/login-form.tsx`
- Test: `src/features/auth/login-form.test.tsx`
- Create: `src/app/login/page.tsx`
- Modify: `src/components/landing/hero.tsx`

**Interfaces:**
- Produces: `safeNextPath(value, fallback?): string`
- Produces: `AuthActionState`
- Produces: `requestMagicLink(previous, formData): Promise<AuthActionState>`
- Produces: `signInWithGoogle(formData): Promise<void>`
- Produces: `<LoginForm requestMagicLinkAction googleAction />`

- [ ] **Step 1: Write failing redirect and message tests**

Create `src/features/auth/redirect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/boards/new?template=event", "/boards/new?template=event"],
    ["https://evil.test", "/dashboard"],
    ["//evil.test", "/dashboard"],
    ["javascript:alert(1)", "/dashboard"],
    ["%2F%2Fevil.test", "/dashboard"],
    [null, "/dashboard"],
  ])("maps %s to %s", (value, expected) => {
    expect(safeNextPath(value)).toBe(expected);
  });
});
```

Create `src/features/auth/messages.test.ts`:

```ts
import { expect, it } from "vitest";
import { authErrorMessage } from "./messages";

it("does not expose provider errors", () => {
  expect(authErrorMessage("rate_limit", "sensitive provider details")).toBe(
    "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
  );
  expect(authErrorMessage("unknown", "sensitive provider details")).not.toContain(
    "sensitive",
  );
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm run test:run -- src/features/auth/redirect.test.ts src/features/auth/messages.test.ts
```

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement redirect and stable messages**

Create `src/features/auth/redirect.ts`:

```ts
export function safeNextPath(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!value) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
  if (decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded)) {
    return fallback;
  }
  return decoded;
}
```

Create `src/features/auth/messages.ts`:

```ts
export type AuthErrorCode =
  | "rate_limit"
  | "email"
  | "google"
  | "callback"
  | "expired"
  | "network"
  | "unknown";

const messages: Record<AuthErrorCode, string> = {
  rate_limit: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
  email: "매직링크를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
  google: "Google 로그인을 시작하지 못했습니다.",
  callback: "로그인을 완료하지 못했습니다. 다시 시도해 주세요.",
  expired: "로그인 링크가 만료되었거나 올바르지 않습니다.",
  network: "네트워크 연결을 확인하고 다시 시도해 주세요.",
  unknown: "로그인 중 문제가 발생했습니다. 다시 시도해 주세요.",
};

export function authErrorMessage(
  code: AuthErrorCode,
  _providerMessage?: string,
): string {
  return messages[code];
}
```

- [ ] **Step 4: Verify redirect and message tests GREEN**

Run:

```bash
npm run test:run -- src/features/auth/redirect.test.ts src/features/auth/messages.test.ts
```

Expected: all cases pass.

- [ ] **Step 5: Write failing server-action tests**

Create `src/features/auth/actions.test.ts` with mocked
`createServerSupabaseClient` and `next/navigation`. Assert:

```ts
expect(signInWithOtp).toHaveBeenCalledWith({
  email: "owner@example.com",
  options: {
    shouldCreateUser: true,
    emailRedirectTo: "http://localhost:3000/dashboard",
  },
});
expect(result).toEqual({
  status: "success",
  message:
    "입력한 주소로 로그인 링크를 보냈습니다. 이메일을 확인해 주세요.",
});
```

Also assert:

- invalid email returns `{ status: "error", message: "이메일 주소를 확인해 주세요." }`;
- rate-limit provider failures map to the stable rate-limit message;
- Google calls `signInWithOAuth({ provider: "google", options: {
  redirectTo: "http://localhost:3000/auth/callback?next=%2Fdashboard" } })`;
- the returned provider URL is passed to `redirect()`;
- provider error messages never occur in returned action state.

- [ ] **Step 6: Verify action tests RED**

Run:

```bash
npm run test:run -- src/features/auth/actions.test.ts
```

Expected: FAIL because `actions.ts` does not exist.

- [ ] **Step 7: Implement server actions**

Create `src/features/auth/actions.ts` with `"use server"` and:

```ts
export type AuthActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function requestMagicLink(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState>;

export async function signInWithGoogle(formData: FormData): Promise<void>;

export async function signOut(): Promise<void>;
```

Implementation requirements:

- validate email with `z.email()`;
- call the exact `signInWithOtp` shape asserted in Step 5;
- detect a Supabase status of `429` as `rate_limit`;
- use `safeNextPath(String(formData.get("next") ?? ""))`;
- create OAuth redirect URLs from `getServerEnv().NEXT_PUBLIC_APP_URL`;
- call `redirect(data.url)` only when Supabase returns a URL;
- call `supabase.auth.signOut()` and redirect to `/` for sign-out;
- never return `error.message`.

- [ ] **Step 8: Verify action tests GREEN**

Run:

```bash
npm run test:run -- src/features/auth/actions.test.ts
```

Expected: all action tests pass.

- [ ] **Step 9: Write the failing login component test**

Create `src/features/auth/login-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

it("offers magic-link and Google sign-in accessibly", async () => {
  const user = userEvent.setup();
  const magicLink = vi.fn(async () => ({
    status: "success" as const,
    message: "입력한 주소로 로그인 링크를 보냈습니다. 이메일을 확인해 주세요.",
  }));
  const google = vi.fn(async () => undefined);

  render(
    <LoginForm
      next="/dashboard"
      requestMagicLinkAction={magicLink}
      googleAction={google}
    />,
  );

  await user.type(screen.getByLabelText("이메일"), "owner@example.com");
  await user.click(screen.getByRole("button", { name: "매직링크 받기" }));

  expect(magicLink).toHaveBeenCalled();
  expect(
    await screen.findByText(/입력한 주소로 로그인 링크를 보냈습니다/),
  ).toHaveAttribute("role", "status");
  expect(
    screen.getByRole("button", { name: "Google로 계속하기" }),
  ).toBeEnabled();
});
```

- [ ] **Step 10: Verify login component RED**

Run:

```bash
npm run test:run -- src/features/auth/login-form.test.tsx
```

Expected: FAIL because `LoginForm` does not exist.

- [ ] **Step 11: Implement and wire the login route**

Create a client `LoginForm` that:

- uses `useActionState(requestMagicLinkAction, { status: "idle" })`;
- renders a labeled `type="email"` input with `autoComplete="email"`;
- includes hidden `next` inputs in both forms;
- disables the submitted button while pending;
- renders success copy with `role="status"` and errors with `role="alert"`;
- keeps provider error details out of the DOM.

Create `src/app/login/page.tsx` to validate the search-param `next` value with
`safeNextPath`, render the poster-style login panel, and pass the real actions.

Keep the landing CTA in `src/components/landing/hero.tsx` pointed at the exact
`/login` destination and retain its existing accessible name.

- [ ] **Step 12: Verify and commit Task 4**

Run:

```bash
npm run test:run -- src/features/auth src/components/landing src/app/page.test.tsx
npm run typecheck
npm run lint
```

Expected: all checks pass.

```bash
git add src/features/auth src/app/login src/components/landing
git commit -m "feat: add passwordless login experience"
```

---

### Task 5: PKCE callbacks and secure session refresh

**Files:**
- Create: `src/app/auth/callback/route.ts`
- Test: `src/app/auth/callback/route.test.ts`
- Create: `src/app/auth/confirm/route.ts`
- Test: `src/app/auth/confirm/route.test.ts`
- Create: `src/lib/supabase/proxy.ts`
- Test: `src/lib/supabase/proxy.test.ts`
- Modify: `src/proxy.ts`
- Modify: `src/lib/security/policy.ts`
- Modify: `src/lib/security/policy.test.ts`

**Interfaces:**
- Produces: GET handlers for Google code exchange and email token verification
- Produces: `updateSupabaseSession(request, requestHeaders): Promise<NextResponse>`
- Preserves: per-request CSP nonce request and response headers

- [ ] **Step 1: Write failing callback route tests**

For each Route Handler, mock `createServerSupabaseClient`.

`src/app/auth/callback/route.test.ts` must prove:

- a valid `code` calls `exchangeCodeForSession(code)`;
- success redirects to `/dashboard`;
- `next=https://evil.test` still redirects to `/dashboard`;
- missing or rejected code redirects to `/login?error=callback`.

`src/app/auth/confirm/route.test.ts` must prove:

- `token_hash` and `type=email` call
  `verifyOtp({ token_hash, type: "email" })`;
- success redirects to `/dashboard`;
- missing, unsupported, or rejected input redirects to
  `/login?error=expired`;
- the response never contains the provider error message.

- [ ] **Step 2: Verify callback tests RED**

Run:

```bash
npm run test:run -- src/app/auth
```

Expected: FAIL because both handlers are missing.

- [ ] **Step 3: Implement callback handlers**

Both handlers:

- construct redirects with `new URL(path, request.url)`;
- validate `next` with `safeNextPath`;
- create the Supabase server client inside `GET`;
- expose only `callback` or `expired` query codes;
- never include raw errors or tokens in a redirect.

For email types, import `EmailOtpType` and accept only:

```ts
const supportedTypes = new Set<EmailOtpType>([
  "email",
  "signup",
  "invite",
  "recovery",
  "email_change",
]);
```

- [ ] **Step 4: Verify callback tests GREEN**

Run:

```bash
npm run test:run -- src/app/auth
```

Expected: all callback cases pass.

- [ ] **Step 5: Write failing session/CSP composition tests**

Create `src/lib/supabase/proxy.test.ts` and extend
`src/lib/security/policy.test.ts` to prove:

- `updateSupabaseSession` invokes `getClaims()`, not `getSession()`;
- refreshed cookies are copied to the outgoing response;
- a response that writes cookies contains `Cache-Control: private, no-store`;
- `connect-src` allows the configured Supabase HTTPS origin;
- the final `src/proxy.ts` response retains a nonce-bearing CSP.

- [ ] **Step 6: Verify session tests RED**

Run:

```bash
npm run test:run -- src/lib/supabase/proxy.test.ts src/lib/security/policy.test.ts
```

Expected: FAIL because session refresh and Supabase CSP origin support are
missing.

- [ ] **Step 7: Implement request-scoped session refresh**

Create `src/lib/supabase/proxy.ts` with:

```ts
export async function updateSupabaseSession(
  request: NextRequest,
  requestHeaders: Headers,
): Promise<NextResponse>;
```

The function must:

- create its client inside the function;
- use the publishable key;
- read cookies with `request.cookies.getAll()`;
- in `setAll`, write cookies to `request.cookies`, recreate `NextResponse.next`
  with `requestHeaders`, and copy all cookies to the response;
- set `Cache-Control: private, no-store` when cookies change;
- call `await supabase.auth.getClaims()`;
- return the response without route redirects.

Change `buildContentSecurityPolicy` to accept an optional Supabase origin and
emit:

```ts
`connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`
```

Update `src/proxy.ts` to:

1. create nonce and request headers;
2. pass the configured Supabase origin to the CSP builder;
3. await `updateSupabaseSession(request, requestHeaders)`;
4. set the same CSP on the returned response.

- [ ] **Step 8: Verify and commit Task 5**

Run:

```bash
npm run test:run -- src/app/auth src/lib/supabase/proxy.test.ts src/lib/security/policy.test.ts
npm run typecheck
npm run lint
```

Expected: all checks pass.

```bash
git add src/app/auth src/lib/supabase/proxy.ts src/proxy.ts src/lib/security
git commit -m "feat: complete secure auth callbacks"
```

---

### Task 6: Verified user boundary and protected dashboard

**Files:**
- Create: `src/features/auth/require-user.ts`
- Test: `src/features/auth/require-user.test.ts`
- Create: `src/app/dashboard/page.tsx`
- Test: `src/app/dashboard/page.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `requireUser(): Promise<{ id: string; email: string | null }>`
- Produces: authenticated dashboard shell and sign-out form

- [ ] **Step 1: Write the failing verified-user tests**

Create `src/features/auth/require-user.test.ts` and mock the server client.
Assert:

- missing claims call `redirect("/login?next=%2Fdashboard")`;
- valid claims return `sub` as `id` and string email as `email`;
- `getSession` is never called.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm run test:run -- src/features/auth/require-user.test.ts
```

Expected: FAIL because `requireUser` does not exist.

- [ ] **Step 3: Implement the verified-user boundary**

Create `src/features/auth/require-user.ts`:

```ts
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
```

- [ ] **Step 4: Verify `requireUser` GREEN**

Run:

```bash
npm run test:run -- src/features/auth/require-user.test.ts
```

Expected: all cases pass.

- [ ] **Step 5: Write the failing dashboard component test**

Create `src/app/dashboard/page.test.tsx` with `requireUser` mocked to return
`{ id: "user-id", email: "owner@example.com" }`. Assert:

```tsx
expect(
  screen.getByRole("heading", { level: 1, name: "내 안내판" }),
).toBeVisible();
expect(screen.getByText("owner@example.com")).toBeVisible();
expect(screen.getByText("아직 만든 안내판이 없습니다.")).toBeVisible();
expect(screen.getByRole("button", { name: "로그아웃" })).toBeVisible();
```

- [ ] **Step 6: Verify dashboard RED**

Run:

```bash
npm run test:run -- src/app/dashboard/page.test.tsx
```

Expected: FAIL because the dashboard page does not exist.

- [ ] **Step 7: Implement the dashboard shell**

Create an async Server Component that:

- awaits `requireUser()` before rendering;
- presents “내 안내판” as the level-one heading;
- shows the verified email or “로그인 사용자”;
- renders an empty state and a disabled-looking Phase 3 creation hint;
- posts the sign-out form to `signOut`;
- uses the existing bold-poster tokens with responsive CSS;
- does not query boards before Phase 3.

- [ ] **Step 8: Verify and commit Task 6**

Run:

```bash
npm run test:run -- src/features/auth src/app/dashboard/page.test.tsx
npm run typecheck
npm run lint
```

Expected: all checks pass.

```bash
git add src/features/auth/require-user.ts src/features/auth/require-user.test.ts src/app/dashboard src/app/globals.css
git commit -m "feat: protect dashboard shell"
```

---

### Task 7: E2E, secret leakage gate, hosted configuration, and phase verification

**Files:**
- Create: `scripts/check-client-secret.mjs`
- Modify: `package.json`
- Modify: `playwright.config.ts`
- Create: `tests/e2e/auth.spec.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm run security:client-secret`
- Extends: `npm run verify`
- Documents: hosted redirect, email template, Google provider, and migration rules

- [ ] **Step 1: Write the secret scanner**

Create `scripts/check-client-secret.mjs`:

```js
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const secret = process.env.SUPABASE_SECRET_KEY;
if (!secret) {
  throw new Error("SUPABASE_SECRET_KEY is required for the leakage check");
}

async function filesUnder(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry);
    const details = await stat(path);
    if (details.isDirectory()) files.push(...(await filesUnder(path)));
    else files.push(path);
  }
  return files;
}

const files = await filesUnder(".next");
for (const file of files) {
  const content = await readFile(file);
  if (content.includes(Buffer.from(secret))) {
    throw new Error(`Server secret detected in build artifact: ${file}`);
  }
}

console.log("Supabase server secret is absent from build artifacts.");
```

Add:

```json
{
  "scripts": {
    "security:client-secret": "node scripts/check-client-secret.mjs",
    "verify": "npm run lint && npm run typecheck && npm run test:run && npm run build && npm run security:client-secret"
  }
}
```

- [ ] **Step 2: Verify the scanner catches a planted value**

After a build, copy the secret value into a temporary file under
`.next/secret-scan-fixture.txt`, run the scanner, and confirm it exits non-zero
without printing the secret value. Remove only that exact temporary fixture,
then rerun the scanner.

Expected: planted run fails with the fixture path; clean run exits 0.

- [ ] **Step 3: Add authentication E2E tests**

Create `tests/e2e/auth.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("login page exposes both approved authentication methods", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByLabel("이메일")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "매직링크 받기" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Google로 계속하기" }),
  ).toBeVisible();
});

test("dashboard redirects anonymous visitors to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  await expect(page.getByLabel("이메일")).toBeVisible();
});
```

- [ ] **Step 4: Provide deterministic build and E2E configuration**

Add these dummy values to the `webServer.env` block in
`playwright.config.ts` and the workflow-level `env` block:

```yaml
NEXT_PUBLIC_SUPABASE_URL: https://project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb_publishable_ci_test
SUPABASE_SECRET_KEY: sb_secret_ci_test
```

The dummy values must pass schema validation but must not contact a real
project during build or anonymous redirect tests.

- [ ] **Step 5: Update CI and README**

In `.github/workflows/ci.yml`, keep the existing quality and E2E jobs and ensure
the quality job runs `npm run verify`, followed by
`npm audit --audit-level=high`.

Document in `README.md`:

- the four application environment variables;
- `npx supabase login`, `link`, `db push --dry-run`, `db push`,
  `migration list`, `db lint`, and `test db --linked`;
- the absolute prohibition on `db reset --linked`;
- Supabase Site URL `http://localhost:3000`;
- redirect allowlist entries
  `http://localhost:3000/auth/callback` and
  `http://localhost:3000/auth/confirm`;
- the Magic Link template target
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`;
- Google provider activation and the Supabase callback URL shown in the hosted
  dashboard;
- the rule that remote fixture tests stop before real customer data is admitted.

- [ ] **Step 6: Run automated verification**

Run sequentially to avoid competing Next.js build locks:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run verify
npm run test:e2e
npm audit --audit-level=high
npx supabase migration list --linked
npx supabase db lint --linked --level error --fail-on error
npx supabase test db --linked supabase/tests/phase2_rls.test.sql
git diff --check
```

Expected:

- lint and type checking pass;
- all Vitest tests pass;
- Next.js production build succeeds;
- secret scanner exits 0;
- all Playwright tests pass;
- audit reports no high-or-critical vulnerabilities;
- local and remote migration lists agree;
- database lint exits 0;
- 12 pgTAP assertions pass;
- no whitespace errors occur.

- [ ] **Step 7: Perform hosted authentication configuration**

In the hosted Supabase Dashboard:

1. Set Site URL to `http://localhost:3000`.
2. Add the two localhost callback/confirm redirect URLs.
3. Replace the Magic Link template link with the exact token-hash URL documented
   in Step 5.
4. Enable Google and save the Google Client ID and Secret in the provider
   configuration.
5. In Google Auth Platform, register the hosted Supabase callback URL displayed
   by the Supabase provider configuration.

No secret value is copied into the repository or command output.

- [ ] **Step 8: Perform one manual provider smoke test**

Run `npm run dev`, then verify in the browser:

1. Request a magic link for a controlled test address.
2. Open the received link and confirm `/dashboard` renders.
3. Sign out and confirm the landing page renders.
4. Choose Google login, complete consent, and confirm `/dashboard` renders.
5. Confirm both new Auth users have matching `public.profiles` rows.

Expected: both providers establish cookie-backed sessions and sign-out removes
dashboard access.

- [ ] **Step 9: Commit Task 7**

```bash
git add scripts package.json package-lock.json playwright.config.ts tests/e2e .github/workflows/ci.yml README.md
git commit -m "test: verify hosted authentication foundation"
```

---

## Final Phase 2 Exit Gate

Before integration, run the full Task 7 verification block again from a clean
working tree and record:

- commit SHA;
- test file and assertion counts;
- Playwright pass count;
- migration versions present remotely;
- database lint status;
- dependency audit result;
- secret scanner result;
- successful manual magic-link and Google smoke tests.

Then use `superpowers:verification-before-completion` and
`superpowers:finishing-a-development-branch`. Do not merge, push, reset the
database, or remove the worktree without the user's selected finishing option.
