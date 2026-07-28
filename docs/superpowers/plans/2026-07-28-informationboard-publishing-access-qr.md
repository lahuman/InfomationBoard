# InformationBoard Phase 4 Implementation Plan

**Goal:** Deliver stable publication, public and password-protected visitor
access, indexing controls, and canonical QR downloads.

**Architecture:** Authenticated Server Actions own publication mutations,
PostgreSQL RLS exposes only safe public rows to anonymous visitors, and
server-only password verification mediates protected content. Public rendering
reuses the safe Markdown and theme system. QR images are derived from the
configured application origin and are never persisted.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Supabase/PostgreSQL, Zod,
Argon2id, a server-side QR encoder, Vitest, Playwright, and pgTAP.

## Working Rules

- Preserve every board slug across all publication changes.
- Keep private-schema tables inaccessible to browser clients.
- Never log or persist plaintext board passwords or raw visitor IP addresses.
- Use generic not-found behavior for missing, draft, private, and unauthorized
  boards.
- Keep password and private responses non-indexable and non-cacheable.
- Run focused tests per task and `npm run verify` at each task boundary.

## Task 1: Add the Public Database Boundary

**Files**

- Add `supabase/migrations/20260728000400_public_board_access.sql`
- Add `supabase/migrations/20260728000500_restrict_anon_board_columns.sql`
- Add `supabase/tests/phase4_publishing.test.sql`

**Steps**

1. Add failing assertions for publication timestamps and anonymous visibility.
2. Add a trigger that owns `published_at` lifecycle transitions.
3. Grant anonymous access only to public presentation columns.
4. Add an anonymous RLS policy limited to published public rows.
5. Prove drafts, private rows, password rows, and sensitive columns remain
   inaccessible.

**Exit:** PostgreSQL independently enforces the public visitor boundary.

## Task 2: Add Publication Schemas and Owner Actions

**Files**

- Update `src/features/boards/schema.ts`
- Add `src/features/boards/publication/schema.test.ts`
- Add `src/features/boards/actions/publish-board.ts`
- Add `src/features/boards/actions/publish-board.test.ts`
- Add a password-publication SQL function and generated database types

**Steps**

1. Define strict public, password, and private-draft mutation schemas.
2. Require the current revision and preserve the existing slug.
3. Implement public and private transitions through the owner RLS client.
4. Hash password input with Argon2id in the Node.js runtime.
5. Atomically replace the private hash and board visibility.
6. Return typed saved, conflict, validation, and safe error states.

**Exit:** Owners can change publication state without leaking secrets or
overwriting stale edits.

## Task 3: Build Publication Settings

**Files**

- Add publication settings components and tests
- Update the editor query, editor page, and editor styles

**Steps**

1. Show current lifecycle, visibility, canonical URL, and indexing state.
2. Provide public, password, and private-draft choices.
3. Require explicit confirmation when withdrawing a published board.
4. Keep password input transient and clear it after submission.
5. Refresh the editor and dashboard state after a successful transition.

**Exit:** The owner can understand and safely change every publication state.

## Task 4: Render Public Boards

**Files**

- Add safe public-board query functions and tests
- Add `src/app/b/[slug]/page.tsx` and tests
- Add public-board presentation components and metadata tests

**Steps**

1. Query published public boards through the anonymous RLS boundary.
2. Render safe Markdown and controlled theme values mobile-first.
3. Return the same not-found response for every unavailable state.
4. Emit canonical, Open Graph, and robots metadata.
5. Revalidate public content after owner publication mutations.

**Exit:** Anyone with the URL can view public content without receiving private
fields.

## Task 5: Add Password Verification and Lockout

**Files**

- Add server-only password, visitor-key, access-cookie, and lockout modules
- Add verification actions and tests
- Add the password challenge component
- Update `/b/[slug]`

**Steps**

1. Verify Argon2id hashes only in the Node.js server runtime.
2. HMAC the anonymous request key before database storage.
3. Enforce five failures per 15 minutes and a 15-minute lock.
4. Sign a versioned, board-scoped 12-hour cookie after success.
5. Render protected content only after cookie verification.
6. Keep challenges and protected content non-cacheable and non-indexable.

**Exit:** Password content is unavailable before verification and brute-force
attempts are bounded.

## Task 6: Add Canonical QR Preview and Downloads

**Files**

- Add QR URL and encoder modules with tests
- Add PNG and SVG route handlers with tests
- Add owner QR controls and tests

**Steps**

1. Construct the board URL only from `NEXT_PUBLIC_APP_URL` and the stable slug.
2. Generate QR output on demand without database or storage writes.
3. Exclude passwords and access tokens from every payload.
4. Add accessible preview, copy-link, PNG download, and SVG download controls.
5. Reject QR access for drafts and private boards.

**Exit:** Public and password boards have stable, safe QR downloads.

## Task 7: Complete Phase 4 Verification

**Files**

- Add `tests/e2e/publishing.spec.ts`
- Update `README.md`

**Steps**

1. Cover public publish, stable update, and private withdrawal.
2. Cover password unlock, expiry, and five-attempt lockout.
3. Validate QR PNG/SVG content and response headers.
4. Run the complete local and hosted database verification block.
5. Record test, build, audit, migration, and secret-scan results.

**Exit:** Every Phase 4 roadmap and security gate passes from a clean tree.
