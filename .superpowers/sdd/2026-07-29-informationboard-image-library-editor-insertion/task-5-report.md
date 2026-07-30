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

---

## Fix Round 1

Status: Complete.

Implementation commit: `ed9e484d0cc1b26c7ea94eb9570a04f7f67c0413`

### Review Findings Resolved

1. Replaced `finalize_board_image` in the deletion migration with an explicit
   lifecycle gate. Identical `ready` finalization remains idempotent, only
   `reserved` may transition to `ready`, and `cancelling`/`deleting` return
   stable distinct errors. A delayed finalize can no longer resurrect a
   claimed deletion.
2. Added authoritative post-claim recovery. Thrown, errored, malformed, or
   mismatched claim responses re-read the owned board and attachment. A
   confirmed `deleting` row returns a safe error with the current revision; an
   absent row returns `deleted` with the current revision.
3. Added board batch-removal recovery. A failed batch falls back to every
   server-resolved path individually. Only success or the exact object-missing
   response for every path permits service-role completion; bucket, route,
   authorization, and other failures remain fail-closed.
4. Replaced the synthetic row-lock test with actual authenticated dblink
   transactions. The test executes `reserve_board_image`, the real
   `storage.objects` INSERT policy, and `claim_board_deletion` under JWT/role
   context in both race directions.
5. Made `storageBytes` optional on `deleted`. Once service-role completion
   succeeds, a later profile usage read failure cannot turn the irreversible
   deletion back into an error. Task 8 documentation now removes the row on
   every `deleted` result and refreshes/recomputes usage when bytes are absent.

### RED Evidence

- Command:
  `npm run test:run -- src/features/boards/images/actions/delete-image.test.ts src/features/boards/actions/delete-board.test.ts`
  Result: 2 files failed; 6 expected behavior tests failed and 20 passed. The
  failures covered irreversible completion followed by usage failure,
  thrown/malformed/mismatched claim recovery, successful per-path retry after
  batch 404, and fail-closed individual non-object 404 handling.
- Command:
  `docker exec supabase_db_InfomationBoard psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/phase5_board_images.fix1-red.test.sql`
  Result: the new finalize assertions failed exactly as expected: finalize
  raised no exception and changed `deleting` back to `ready`. Four later
  assertions also failed as consequences because trusted deletion could no
  longer complete and quota remained charged.

The first execution of the expanded concurrency test exposed only test-fixture
issues: Storage's direct-delete guard required its documented test-only
`storage.allow_delete_query` setting, and dblink omitted the SQLSTATE prefix
from one error string. After correcting those harness expectations, no
production change was needed for the already-correct board lock behavior.

### GREEN Evidence

- `npx supabase db reset --local`: passed from a clean database and applied all
  migrations including the hardened deletion migration.
- `npx supabase test db`: all 5 pgTAP files and 175 assertions passed. This
  includes 104 phase 5 lifecycle assertions and all 18 real two-session
  concurrency assertions.
- The 18 concurrency assertions prove:
  - a real reservation RPC holds the board lock, blocks deletion, commits, and
    leaves its attachment path visible before the claim proceeds;
  - a real Storage INSERT policy evaluation holds the same lock, blocks
    deletion, commits, and leaves the object joined to its attachment path;
  - a deletion claim that wins first makes the real reservation RPC return
    `image_not_found` and makes the real Storage INSERT fail RLS.
- Command:
  `npm run test:run -- src/features/boards/images/actions/delete-image.test.ts src/features/boards/actions/delete-board.test.ts src/features/boards/images/actions/finalize-image.test.ts src/features/boards/images/storage.test.ts src/features/boards/images/references.test.ts`
  Result: 5 files and 53 tests passed.
- `npx supabase db lint`: passed with `No schema errors found`.
- Clean-schema type generation matched
  `src/lib/supabase/database.types.ts`; the only textual difference was a
  trailing blank line, so no generated type change was required.
- `npm run verify`: passed lint, TypeScript, all 64 Vitest files and 304 tests,
  the production Next.js build, and the client-secret artifact scan.
- `git diff --cached --check`: passed before the implementation commit.

### Fix Round 1 Self-Review

- Mutation of the finalize `deleting` branch back to the legacy fallthrough is
  caught by both the stable-error and persisted-state pgTAP assertions.
- Removing authoritative recovery loses revisions or deleted outcomes in three
  focused action tests.
- Treating batch 404 as either unconditional success or unconditional failure
  is caught by the per-path success and non-object fail-closed tests.
- Replacing either actual reservation or Storage INSERT with a synthetic lock
  removes observable function/policy outcomes from the dblink suite.
- Returning an error after successful completion is caught by the usage-read
  failure test.

### Fix Round 1 Remaining Concerns

No implementation blocker remains. `npx supabase db lint` encountered one
intermittent legacy PostgreSQL connection timeout immediately after reset; the
healthy DB status was confirmed and the unchanged command passed on retry.
