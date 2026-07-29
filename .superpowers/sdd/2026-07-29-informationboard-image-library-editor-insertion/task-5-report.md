# Task 5 Report: Reference-Safe Image and Board Deletion

## Status

Complete.

Implementation commit: `4ba8fb0c06cf122af442b7c51f3a04ec02017da2`

## Changed Files

- Added `src/features/boards/images/actions/delete-image.ts`
- Added `src/features/boards/images/actions/delete-image.test.ts`
- Updated `src/features/boards/actions/delete-board.ts`
- Updated `src/features/boards/actions/delete-board.test.ts`
- Updated `src/features/boards/images/references.ts`
- Updated `src/features/boards/images/references.test.ts`
- Updated `src/features/boards/images/storage.ts`
- Updated `src/features/boards/images/storage.test.ts`
- Added `supabase/migrations/20260730000100_safe_image_board_deletion.sql`
- Added `supabase/tests/phase5_board_deletion_concurrency.test.sql`
- Updated `supabase/tests/phase5_board_images.test.sql`
- Regenerated `src/lib/supabase/database.types.ts`
- Updated the image-library design and delivery plan.

## Implementation

Image deletion now uses a durable `deleting` state and a strict trust boundary:

1. The authenticated action resolves the owned board, attachment, stable image
   URL, saved Markdown, and board revision on the server.
2. Exact direct or reference-style Markdown image nodes return `in_use`;
   matching plain text and links do not.
3. `claim_board_image_deletion` locks the board, rejects null or stale
   revisions, claims the owned attachment, and bumps/returns the board revision.
4. The admin Storage client removes exactly the server-resolved path.
5. A service-role-only completion RPC removes metadata and releases quota.

Storage or completion failures leave metadata and quota intact for retry.
Only the exact single-object missing response is accepted as an idempotent
image removal. Library cleanup also retries persisted invisible `deleting`
rows, while delivery and listing continue to expose only `ready` rows.

Board deletion now claims the server-resolved owned board with `FOR UPDATE`,
makes it terminal/private, resolves every attachment path on the server,
removes all objects in one admin batch, and only then invokes service-role
completion. Direct authenticated board deletion and mutation of
`deletion_started_at` are revoked. Owner updates and password publication
cannot republish a claimed board.

The claim's `FOR UPDATE` lock conflicts with the `FOR KEY SHARE` lock used by
reservation and the Storage INSERT policy. An upload that wins finishes before
path enumeration; an upload that loses cannot reserve or insert an object.
Board batch removal treats any Storage error, including a batch-level 404, as
retryable because it cannot prove that every path was removed.

## TDD Evidence

- Initial focused RED:
  `npm run test:run -- src/features/boards/images/actions/delete-image.test.ts src/features/boards/actions/delete-board.test.ts`
  failed because the image action was absent and board cleanup behavior was
  unimplemented.
- The real two-session lock test failed against the old claim behavior because
  deletion did not wait for the upload-side row lock.
- Focused GREEN:
  image deletion and board deletion tests passed, followed by the expanded
  reference/storage/action/query group at 5 files and 41 tests.
- Database GREEN:
  a fresh local reset applied all migrations; the phase 2/phase 5 suite passed
  118 assertions before the final concurrency assertion was strengthened.
  The final two-session pgTAP file then passed both assertions directly in the
  database container, including the specific row `lock_timeout` context.
- `npx supabase db lint`: passed with no schema errors.
- `npm run verify`: passed lint, TypeScript, all 64 Vitest files and 300 tests,
  the production Next.js build, and the client-secret artifact scan.
- `git diff --cached --check`: passed before the implementation commit.

The Supabase CLI intermittently timed out while opening its legacy PostgreSQL
connection during the final rerun. The healthy database answered direct
queries, and the same final concurrency SQL passed in-container with
`ON_ERROR_STOP=1`. Supabase's ignored `start-secrets` bundle also had to be
temporarily moved out of the ESLint scan for `npm run verify`; it was restored
immediately afterward.

## Self-Review

- Confirmed claim → Storage → service completion ordering and fail-closed error
  handling.
- Confirmed no client-provided owner ID or Storage path reaches deletion.
- Confirmed the revision fence closes the saved-Markdown reference race and
  post-claim results carry the bumped revision.
- Confirmed direct and reference-style images are blocked without false
  positives for ordinary text or links.
- Confirmed deletion claims cannot be reversed by normal updates or password
  publication.
- Confirmed persisted `deleting` rows remain charged and recover on a later
  library cleanup.
- Confirmed board deletion serializes against both reservation and upload-side
  row locks.

Independent review found no critical, important, or blocking minor issues and
marked the settled Task 5 diff ready.

## Remaining Concerns

No implementation blocker remains. The only observed instability was the local
Supabase CLI connection timeout described above; the database and final pgTAP
assertions themselves passed.
