# InformationBoard Phase 3 Implementation Plan

**Goal:** Deliver the authenticated board-owner workflow from creation through
safe editing, recovery, import/export, and deletion.

**Architecture:** Server Components load owner-scoped data, Server Actions own
validated mutations, RLS independently enforces ownership, and a focused client
editor manages debounced autosave and local recovery. Markdown is rendered from
source through a strict safe pipeline.

**Tech Stack:** Next.js 16.2.12, React 19.2.8, TypeScript 6.0.3, Supabase JS,
PostgreSQL, Zod, React Markdown, remark-gfm, rehype-sanitize, Vitest, Testing
Library, Playwright, and pgTAP.

## Working Rules

- Use test-first changes for each behavior.
- Keep every route owner-only until Phase 4.
- Never use the service-role client for normal owner operations.
- Do not add public board reads, passwords, QR generation, or attachments.
- Run focused tests after each step and `npm run verify` at each task boundary.
- Keep generated types synchronized with committed migrations.

## Task 1: Add Optimistic Revision Support

**Files**

- Add `supabase/migrations/20260728000300_board_revision.sql`
- Update `supabase/tests/phase2_rls.test.sql`
- Update `src/lib/supabase/database.types.ts`
- Add `src/features/boards/revision.test.ts`

**Steps**

1. Add a failing database assertion for initial revision `1`.
2. Add a failing assertion that an update increments the revision.
3. Add a failing assertion that another owner cannot update by revision.
4. Add the column, constraint, and increment trigger.
5. Regenerate and commit database types.
6. Run database tests, typecheck, and the secret scanner.

**Exit:** Revisions are monotonic and RLS still blocks cross-owner access.

## Task 2: Define Board Domain Schemas and Templates

**Files**

- Add `src/features/boards/schema.ts`
- Add `src/features/boards/schema.test.ts`
- Add `src/features/boards/templates.ts`
- Add `src/features/boards/templates.test.ts`
- Add `src/features/boards/slug.ts`
- Add `src/features/boards/slug.test.ts`

**Steps**

1. Define strict schemas for template, theme, creation, and draft update.
2. Enforce title, summary, and Markdown limits from the database contract.
3. Define store, event, and meeting starter content.
4. Implement cryptographically random lowercase alphanumeric slugs.
5. Test invalid keys, boundary lengths, template defaults, and slug format.

**Exit:** Shared schemas are the only accepted input contract for board
mutations and imports.

## Task 3: Build the Safe Markdown Preview

**Files**

- Update `package.json` and `package-lock.json`
- Add `src/features/boards/markdown/board-markdown.tsx`
- Add `src/features/boards/markdown/board-markdown.test.tsx`
- Add `src/features/boards/markdown/url.ts`
- Add `src/features/boards/markdown/url.test.ts`

**Steps**

1. Add React Markdown, remark-gfm, and rehype-sanitize.
2. Write failing tests for raw HTML, scripts, unsafe protocols, and opener
   isolation.
3. Implement the explicit element/attribute allowlist.
4. Add accessible styling hooks without accepting user CSS.
5. Verify representative template Markdown.

**Exit:** Unsafe markup cannot execute and supported Markdown renders
predictably.

## Task 4: Replace the Dashboard Shell

**Files**

- Add `src/features/boards/queries.ts`
- Add `src/features/boards/queries.test.ts`
- Add `src/features/boards/board-list.tsx`
- Add `src/features/boards/board-list.test.tsx`
- Add `src/features/boards/storage-meter.tsx`
- Add `src/features/boards/storage-meter.test.tsx`
- Update `src/app/dashboard/page.tsx`
- Update `src/app/dashboard/page.test.tsx`

**Steps**

1. Load the owner profile and boards ordered by latest update.
2. Render empty, populated, and query-failure states.
3. Display the 100 MB storage meter without enabling uploads.
4. Link to board creation and existing editors.
5. Test semantic labels, dates, status, and responsive list behavior.

**Exit:** A signed-in owner sees only their boards and accurate storage use.

## Task 5: Implement Board Creation

**Files**

- Add `src/features/boards/actions/create-board.ts`
- Add `src/features/boards/actions/create-board.test.ts`
- Add `src/features/boards/create-board-form.tsx`
- Add `src/features/boards/create-board-form.test.tsx`
- Add `src/app/boards/new/page.tsx`
- Add `src/app/boards/new/page.test.tsx`

**Steps**

1. Protect `/boards/new`.
2. Render the three template choices with starter previews.
3. Validate the action input and authenticated owner.
4. Generate a stable slug and retry bounded unique collisions.
5. Insert a private draft and redirect to its editor.
6. Preserve form state and show safe field errors.

**Exit:** An owner can create each template and another user cannot create on
their behalf.

## Task 6: Implement Editor Loading and Draft Autosave

**Files**

- Add `src/features/boards/actions/update-board.ts`
- Add `src/features/boards/actions/update-board.test.ts`
- Add `src/features/boards/editor/board-editor.tsx`
- Add `src/features/boards/editor/board-editor.test.tsx`
- Add `src/features/boards/editor/autosave.ts`
- Add `src/features/boards/editor/autosave.test.ts`
- Add `src/features/boards/editor/recovery.ts`
- Add `src/features/boards/editor/recovery.test.ts`
- Add `src/app/boards/[id]/edit/page.tsx`
- Add `src/app/boards/[id]/edit/page.test.tsx`

**Steps**

1. Load a board through the owner-scoped server client.
2. Return a generic not-found response for missing or foreign boards.
3. Build desktop split and mobile tab layouts.
4. Implement a 750 ms, single-flight autosave queue.
5. Match updates on `id` and `revision`.
6. Preserve local input on conflict and offer the current server draft.
7. Store and restore a timestamped local recovery copy.
8. Test out-of-order responses, offline failure, reopen, and recovery dismissal.

**Exit:** Autosave is loss-resistant and stale responses cannot overwrite newer
content.

## Task 7: Add Versioned Import and Export

**Files**

- Add `src/features/boards/transfer/schema.ts`
- Add `src/features/boards/transfer/schema.test.ts`
- Add `src/features/boards/transfer/import.ts`
- Add `src/features/boards/transfer/import.test.ts`
- Add `src/features/boards/transfer/export.ts`
- Add `src/features/boards/transfer/export.test.ts`
- Add `src/app/api/boards/[id]/export/route.ts`
- Add `src/app/api/boards/[id]/export/route.test.ts`
- Update `src/features/boards/create-board-form.tsx`

**Steps**

1. Define the strict version `1` export schema.
2. Accept legacy `{md, qr}` and versioned JSON within 512 KB.
3. Convert a safe legacy QR target to an optional Markdown link.
4. Reject unknown fields, unsafe URLs, oversized files, and invalid JSON.
5. Export owner-scoped data with private no-store headers.
6. Verify secrets, identifiers, and attachments never appear in exports.

**Exit:** Legacy and versioned data round-trip safely without private metadata.

## Task 8: Add Deletion and Complete the Phase

**Files**

- Add `src/features/boards/actions/delete-board.ts`
- Add `src/features/boards/actions/delete-board.test.ts`
- Update `src/features/boards/editor/board-editor.tsx`
- Update `src/features/boards/editor/board-editor.test.tsx`
- Add `tests/e2e/board-owner.spec.ts`
- Update `README.md`

**Steps**

1. Add an explicit delete confirmation.
2. Delete with the authenticated RLS client and redirect to the dashboard.
3. Verify missing and foreign IDs reveal no board information.
4. Add E2E coverage for create, autosave, reopen, export, import, and delete.
5. Run the full verification block.
6. Record the migration versions, test counts, build, audit, and secret-scan
   results.

**Exit:** Every Phase 3 roadmap and security gate passes from a clean working
tree.

## Final Verification

Run sequentially:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run test:e2e
npm run check:client-secrets
npm audit --audit-level=high
npx supabase migration list --linked
npx supabase db lint --linked --level error --fail-on error
npx supabase test db --linked supabase/tests/phase2_rls.test.sql
```

Manual verification uses two authenticated accounts to confirm that a second
owner cannot open or mutate the first owner's draft.

