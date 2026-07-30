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

Both test runs must finish at assertion 15. The second run proves fixture
rollback, and the final command prevents test-only schema drift.

Never run `supabase db reset --linked`. Remote fixture tests must run inside a
transaction that rolls back, and must stop before real beta customer data is
admitted.

Apply all pending migrations before deploying the application. In particular,
`20260729000100_board_images.sql` creates the private `board-images` bucket,
atomic account quota accounting, and the reservation/finalization/cancellation
RPC boundary. `20260730000100_safe_image_board_deletion.sql` adds the claimed
image and board deletion boundary. Deploying application code before these
migrations are applied leaves the image workflow unavailable.

## Hosted authentication configuration

In Supabase Dashboard, configure:

- Site URL: the production application origin
- Redirect allowlist:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/confirm`
  - `<production-origin>/auth/callback`
  - `<production-origin>/auth/confirm`
- Email signup and returning-user login both call `signInWithOtp` and use
  Supabase's default **Magic link or OTP** template. Keep its
  `{{ .ConfirmationURL }}` link unchanged. Both flows redirect through the exact
  allowlisted `<application-origin>/auth/callback`, where the PKCE authorization
  code is exchanged for a server-side session.
- `/auth/confirm` remains available for direct token-hash verification in live
  tests or an optional custom email template. Custom SMTP/template configuration
  is not required for the default signup and login flow.

Enable the Google provider in Supabase Authentication, save its Google Client
ID and Client Secret there, then register the hosted Supabase callback URL shown
by that provider screen in Google Auth Platform. Provider secrets must never be
copied into this repository.

## Production deployment

The production service is deployed on Vercel at
<https://informationboard-six.vercel.app>. Configure these variables for the
Production environment in Vercel before deploying:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` as a sensitive value

Deploy the linked project with `npx vercel --prod`. The `.vercelignore` file
keeps all local environment files and Playwright artifacts out of deployment
uploads.

After configuration, manually verify both approved flows:

1. Request a magic link for a controlled test address and confirm that it opens
   `/dashboard`.
2. Sign out and confirm that dashboard access is removed.
3. Complete Google consent and confirm that it opens `/dashboard`.
4. Confirm that each new Auth user has a matching `public.profiles` row.

## Board owner workflow

Authenticated owners can create a private board from the store, event, or
meeting template, edit it with autosave and safe Markdown preview, recover a
newer local draft, and permanently delete it after explicit confirmation.
Supabase is the source of truth; per-board JSON import and export are not part
of the product.

The authenticated owner E2E scenario accepts a Playwright storage-state file:

```bash
E2E_OWNER_STORAGE_STATE=/absolute/path/to/owner-storage-state.json \
  npm run test:e2e -- tests/e2e/board-owner.spec.ts
```

## Board image library

Owners can upload JPEG, PNG, WebP, and GIF images. Each stored image is limited
to 10 MiB (`10,485,760` bytes), each board can retain at most 20 active image
rows, and all boards for one account share a 50 MiB allowance.
`profiles.storage_bytes` includes a reservation immediately and continues to
include `reserved`, transiently `cancelling`, `ready`, and transiently
`deleting` rows until trusted metadata deletion releases the quota.

Image bytes stay in the private `board-images` bucket. Markdown stores stable
`/b/[slug]/images/[attachment-id]` URLs, so image delivery inherits the parent
board's access mode: public images are anonymous, password-board images require
the scoped access cookie, and private/draft images are available only to their
owner.

Run the focused local database and live browser checks with:

```bash
npx supabase test db supabase/tests/phase2_rls.test.sql supabase/tests/phase5_board_images.test.sql
E2E_LIVE_SUPABASE=1 \
  npm run test:e2e -- tests/e2e/board-images.spec.ts
```

The live Playwright setup creates and removes a temporary authenticated owner.
Alternatively, set `E2E_OWNER_STORAGE_STATE` to an authenticated Playwright
storage-state file as described above. Supplying that path also requires the
real Supabase environment variables; Playwright will not run an authenticated
storage state against the fake browser-test configuration.

Supabase CLI 2.110 currently generates
`finalize_board_image.reservation_expires_at` as `string` even though a
successfully finalized SQL row returns `NULL`. Do not hand-edit the generated
database declaration: the server action validates that ready-state field as
`null` at runtime, and the generated type should be refreshed when the CLI can
represent the nullable table-return contract.

## Publishing, protected access, and QR

Owners can publish a board publicly, protect it with a visitor password, or
withdraw it to a private draft without changing its slug. Public reads use an
anonymous, presentation-only Supabase client. Password content is fetched only
through service-role RPCs, with Argon2id verification on the Node.js server.

Password failures are keyed by a domain-separated HMAC of a coarse visitor
network key; raw IP addresses are never stored. Five failures within 15 minutes
create a 15-minute lock. Successful access uses a versioned, board-scoped,
HttpOnly, SameSite=Lax cookie for 12 hours. Replacing or removing the board
password invalidates existing access cookies.

PNG and SVG QR files are generated on demand and contain only
`NEXT_PUBLIC_APP_URL + /b/[slug]`. They never contain a password or access
token, and no QR artifact is persisted.

Run the authenticated Phase 4 browser scenarios against the linked hosted
Supabase project with an automatically created temporary owner:

```bash
E2E_LIVE_SUPABASE=1 \
  npm run test:e2e -- tests/e2e/publishing.spec.ts
```

The global setup creates a unique magic-link owner and writes its browser
session under the gitignored `.playwright/` directory. Global teardown deletes
the Auth user, its cascaded board data, and the local session artifacts even
when a test fails.

An existing owner storage-state file can still be supplied explicitly:

```bash
E2E_OWNER_STORAGE_STATE=/absolute/path/to/owner-storage-state.json \
  npm run test:e2e -- tests/e2e/publishing.spec.ts
```

## Verification

- `npm run verify`
- `npm run test:e2e`
- `npm audit --audit-level=high`
- `npx supabase migration list --linked`
- `npx supabase db lint --linked --level error --fail-on error`
- `npx supabase test db --linked supabase/tests/phase2_rls.test.sql`
- `npx supabase test db supabase/tests/phase2_rls.test.sql supabase/tests/phase4_publishing.test.sql supabase/tests/phase4_password_access.test.sql supabase/tests/phase5_board_images.test.sql`

On the Docker-free workstation, run all transactional database suites twice:

```bash
npx supabase db query --linked --file supabase/tests/phase2_rls.test.sql
npx supabase db query --linked --file supabase/tests/phase2_rls.test.sql
npx supabase db query --linked --file supabase/tests/phase4_publishing.test.sql
npx supabase db query --linked --file supabase/tests/phase4_publishing.test.sql
npx supabase db query --linked --file supabase/tests/phase4_password_access.test.sql
npx supabase db query --linked --file supabase/tests/phase4_password_access.test.sql
```

Expected final assertions are 15, 20, and 18 respectively. The repeated runs
prove every fixture transaction rolls back cleanly.

The archived 2019 prototype lives under `legacy/` and must not be deployed.
