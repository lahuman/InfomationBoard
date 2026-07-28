# InformationBoard

InformationBoard is a free-beta service for creating store, event, and meeting
guides and sharing them through a stable link or QR code.

## Requirements

- Node.js 20.9 or newer; Node.js 24 is used in CI.
- npm.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Run `npm ci`.
3. Run `npm run dev`.
4. Open <http://localhost:3000>.

The application requires four environment variables:

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Browser-safe | Canonical application origin |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Hosted Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | `sb_publishable_...` client key |
| `SUPABASE_SECRET_KEY` | Server only | `sb_secret_...` administrative key |

Never expose `SUPABASE_SECRET_KEY` to Client Components, browser clients, logs,
or committed files.

## Hosted Supabase workflow

This repository uses the existing hosted Supabase Free project. It does not use
a local Supabase stack. Schema history is forward-only under
`supabase/migrations/`.

Authenticate and link the repository:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
```

Preview every remote schema change before applying it:

```bash
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase migration list --linked
npx supabase db lint --linked --level error --fail-on error
npx supabase test db --linked supabase/tests/phase2_rls.test.sql
```

Supabase CLI 2.110 may start a Docker-based `pg_prove` runner even with
`--linked`. On the Docker-free development workstation, run the same
transactional test through the Management API and remove the temporary test
extension afterward:

```bash
npx supabase db query --linked \
  "create extension if not exists pgtap with schema extensions"
npx supabase db query --linked \
  --file supabase/tests/phase2_rls.test.sql --output-format json
npx supabase db query --linked \
  --file supabase/tests/phase2_rls.test.sql --output-format json
npx supabase db query --linked "drop extension pgtap"
```

Both test runs must finish at assertion 12. The second run proves fixture
rollback, and the final command prevents test-only schema drift.

Never run `supabase db reset --linked`. Remote fixture tests must run inside a
transaction that rolls back, and must stop before real beta customer data is
admitted.

## Hosted authentication configuration

In Supabase Dashboard, configure:

- Site URL: `http://localhost:3000`
- Redirect allowlist:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/confirm`
- Magic Link email template target:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`

Enable the Google provider in Supabase Authentication, save its Google Client
ID and Client Secret there, then register the hosted Supabase callback URL shown
by that provider screen in Google Auth Platform. Provider secrets must never be
copied into this repository.

After configuration, manually verify both approved flows:

1. Request a magic link for a controlled test address and confirm that it opens
   `/dashboard`.
2. Sign out and confirm that dashboard access is removed.
3. Complete Google consent and confirm that it opens `/dashboard`.
4. Confirm that each new Auth user has a matching `public.profiles` row.

## Verification

- `npm run verify`
- `npm run test:e2e`
- `npm audit --audit-level=high`
- `npx supabase migration list --linked`
- `npx supabase db lint --linked --level error --fail-on error`
- `npx supabase test db --linked supabase/tests/phase2_rls.test.sql`

The archived 2019 prototype lives under `legacy/` and must not be deployed.
