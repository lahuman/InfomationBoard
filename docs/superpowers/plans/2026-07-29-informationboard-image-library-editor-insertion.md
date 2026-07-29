# InformationBoard Image Library and Editor Insertion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure board-scoped image library with atomic 50 MB account quotas, direct uploads, safe deletion, access-controlled delivery, and rich/source editor insertion.

**Architecture:** PostgreSQL owns reservations and quota accounting, a private Supabase Storage bucket owns image bytes, and server actions coordinate signed direct uploads and verified lifecycle transitions. Markdown stores `/b/<slug>/images/<attachment-id>` URLs; an authorized Next.js route streams private objects, while a focused image-library component integrates with the existing Milkdown editor.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Supabase PostgreSQL/Storage, Zod 4, Milkdown 7, Sharp 0.35, React Markdown 10, Vitest 4, Testing Library, pgTAP, Playwright 1.62.

## Global Constraints

- Account limit is exactly `52,428,800` bytes (50 MiB), counting both `reserved` and `ready` rows.
- Per-image limit is exactly `10,485,760` bytes (10 MiB), with no more than 20 reserved or ready images per board.
- Reservations expire after 15 minutes and are reclaimed before the next list or reservation operation; no scheduler is required.
- Only JPEG (`image/jpeg`), PNG (`image/png`), WebP (`image/webp`), and GIF (`image/gif`) are accepted; SVG and general files remain out of scope.
- Storage bucket `board-images` remains private and object paths are `<owner-id>/<board-id>/<attachment-id>`.
- Browser checks improve feedback, but database ownership/quota checks and server byte decoding are authoritative.
- Only `ready` images can be listed, inserted, delivered, or deleted through the normal ready-image flow.
- Stable Markdown URLs use `/b/<board-slug>/images/<attachment-id>` so the existing board-scoped password cookie is sent.
- An image referenced by current unsaved Markdown or latest saved Markdown cannot be deleted.
- Raw HTML remains disabled and unsafe URL schemes remain rejected.
- All user-facing upload and delete failures are safe Korean copy without paths, SQL, keys, or stack traces.
- All code changes are test-driven and each task ends in a focused green test run and an intentional commit.

---

## File Map

### Shared image domain

- Create `src/features/boards/images/model.ts`: limits, MIME allowlist, `BoardImage`, action result types, stable URL builder, filename/alt normalization.
- Create `src/features/boards/images/references.ts`: Markdown AST image-reference detection.
- Create `src/features/boards/images/references.test.ts` and `model.test.ts`: pure domain coverage.
- Modify `src/features/boards/storage-meter.tsx` and tests: import the 50 MB constant and update copy.

### Database and generated contract

- Create `supabase/migrations/20260729000100_board_images.sql`: private bucket, constraints, atomic quota triggers, reservation/finalize/cancel/delete RPCs, grants.
- Create `supabase/tests/phase5_board_images.test.sql`: pgTAP quota, ownership, count, state, and release tests.
- Modify `supabase/tests/phase2_rls.test.sql`: replace now-revoked direct attachment writes with the supported reservation RPC.
- Modify `src/lib/supabase/database.types.ts`: generated attachment and RPC signatures.

### Server lifecycle and queries

- Create `src/features/boards/images/queries.ts` and tests: owner library/profile usage query and row mapping.
- Create `src/features/boards/images/storage.ts` and tests: admin bucket operations, expiry cleanup, and Sharp verification.
- Create `src/features/boards/images/actions/reserve-image.ts`, `finalize-image.ts`, `cancel-image.ts`, `delete-image.ts` and focused tests.
- Create `src/features/boards/images/upload-image.ts` and tests: browser signed-upload coordinator.
- Modify `src/features/boards/actions/delete-board.ts` and tests: remove board objects before row cascade.

### Delivery and rendering

- Create `src/features/boards/images/delivery.ts` and tests: owner/public/password authorization decision.
- Create `src/app/b/[slug]/images/[attachmentId]/route.ts` and tests: safe streaming response.
- Modify `src/features/boards/markdown/url.ts`, `board-markdown.tsx`, and tests: safe image URLs and sanitized `<img>` rendering.

### Editor and management UI

- Modify `src/features/boards/editor/markdown-editor/types.ts`, `milkdown-editor.ts`, and tests: image insertion command.
- Create `src/features/boards/images/image-library.tsx` and tests: upload/list/insert/delete UI.
- Modify `src/features/boards/editor/markdown-editor/markdown-content-editor.tsx` and tests: image toolbar/panel and rich/source selection insertion.
- Modify `src/features/boards/editor/board-editor.tsx` and tests: pass initial library and actions without disturbing autosave.
- Modify `src/features/boards/editor/queries.ts`, `src/app/boards/[id]/edit/page.tsx`, and tests: load and inject image data/actions.
- Modify `src/app/globals.css`: responsive image panel, thumbnails, states, and rendered Markdown images.

### End-to-end verification

- Create `tests/e2e/board-images.spec.ts`: authenticated upload/insert/render/delete quota flow and unauthorized delivery checks.
- Modify `README.md`: document bucket/migration, 50 MB/10 MB/20-image limits, and live E2E prerequisites.

---

### Task 1: Establish the Shared Image Contract and 50 MB UI Limit

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/features/boards/images/model.ts`
- Create: `src/features/boards/images/model.test.ts`
- Create: `src/features/boards/images/references.ts`
- Create: `src/features/boards/images/references.test.ts`
- Modify: `src/features/boards/storage-meter.tsx`
- Modify: `src/features/boards/storage-meter.test.tsx`
- Modify: `src/app/dashboard/page.test.tsx`

**Interfaces:**
- Produces: `ACCOUNT_STORAGE_LIMIT_BYTES`, `IMAGE_FILE_LIMIT_BYTES`, `BOARD_IMAGE_LIMIT`, `IMAGE_BUCKET`, `BoardImage`, `BoardImageLibrary`, `boardImageUrl(slug, attachmentId)`, `defaultImageAlt(filename)`, and `hasBoardImageReference(markdown, url)`.
- Consumes: no feature interfaces; this is the root domain task.

- [ ] **Step 1: Install direct Markdown AST dependencies**

Run:

```bash
npm install --save-exact remark-parse@11.0.0 unified@11.0.5 unist-util-visit@5.1.0
npm install --save-dev --save-exact @types/mdast@4.0.4
```

Expected: `package.json` and `package-lock.json` record direct dependencies; no application source changes yet.

- [ ] **Step 2: Write failing model and reference tests**

Create exact assertions for constants, stable URL validation, default alt text, and AST-only references:

```ts
expect(ACCOUNT_STORAGE_LIMIT_BYTES).toBe(50 * 1_048_576);
expect(IMAGE_FILE_LIMIT_BYTES).toBe(10 * 1_048_576);
expect(BOARD_IMAGE_LIMIT).toBe(20);
expect(boardImageUrl("summer-market", imageId)).toBe(
  `/b/summer-market/images/${imageId}`,
);
expect(defaultImageAlt("poster.final.png")).toBe("poster.final");
expect(hasBoardImageReference(`![포스터](${url})`, url)).toBe(true);
expect(hasBoardImageReference(`주소: ${url}`, url)).toBe(false);
expect(hasBoardImageReference(`[링크](${url})`, url)).toBe(false);
```

Update storage tests to expect `25 MB / 50 MB`, clamp `75 MB` to the meter maximum while showing the recorded total, and expect the note `계정당 최대 50MB · 안내판 편집기에서 이미지를 관리할 수 있습니다.` Update the dashboard test to expect `1 MB / 50 MB`.

- [ ] **Step 3: Run focused tests to prove the contract is missing**

Run:

```bash
npm run test:run -- src/features/boards/images/model.test.ts src/features/boards/images/references.test.ts src/features/boards/storage-meter.test.tsx src/app/dashboard/page.test.tsx
```

Expected: FAIL because the new modules and 50 MB copy do not exist.

- [ ] **Step 4: Implement the pure domain modules**

Use these exported values and shapes:

```ts
export const ACCOUNT_STORAGE_LIMIT_BYTES = 50 * 1_048_576;
export const IMAGE_FILE_LIMIT_BYTES = 10 * 1_048_576;
export const BOARD_IMAGE_LIMIT = 20;
export const IMAGE_RESERVATION_MINUTES = 15;
export const IMAGE_BUCKET = "board-images";
export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type BoardImage = {
  id: string;
  originalFilename: string;
  mimeType: (typeof ACCEPTED_IMAGE_MIME_TYPES)[number];
  sizeBytes: number;
  url: string;
};

export type BoardImageLibrary = {
  images: BoardImage[];
  storageBytes: number;
};
```

Validate the slug and UUID before building a URL. Strip path components, control characters, outer whitespace, and all but the final extension when deriving display filename and default alt text; cap stored display filenames at 180 Unicode code points.

Implement reference detection with an AST, not a substring search:

```ts
const tree = unified().use(remarkParse).parse(markdown);
let found = false;
visit(tree, "image", (node) => {
  if (node.url === imageUrl) found = true;
});
return found;
```

Move the storage limit import into `storage-meter.tsx`, keep `formatStorageBytes`, change the note, and remove the old local 100 MB constant.

- [ ] **Step 5: Run the focused tests**

Run:

```bash
npm run test:run -- src/features/boards/images/model.test.ts src/features/boards/images/references.test.ts src/features/boards/storage-meter.test.tsx src/app/dashboard/page.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the shared contract**

```bash
git add package.json package-lock.json src/features/boards/images/model.ts src/features/boards/images/model.test.ts src/features/boards/images/references.ts src/features/boards/images/references.test.ts src/features/boards/storage-meter.tsx src/features/boards/storage-meter.test.tsx src/app/dashboard/page.test.tsx
git commit -m "feat: define image limits and references"
```

---

### Task 2: Enforce Atomic Image Quotas in PostgreSQL

**Files:**
- Create: `supabase/migrations/20260729000100_board_images.sql`
- Create: `supabase/tests/phase5_board_images.test.sql`
- Modify: `supabase/tests/phase2_rls.test.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: exact byte, MIME, count, bucket, and expiry constants from Task 1, duplicated as SQL literals at the database trust boundary.
- Produces: RPCs `reserve_board_image(uuid,text,text,bigint)`, `finalize_board_image(uuid,text,bigint)`, `cancel_board_image(uuid)`, and `delete_board_image_record(uuid)` plus updated generated TypeScript signatures.

- [ ] **Step 1: Write failing pgTAP coverage**

Create two users and boards following `phase2_rls.test.sql`. Exercise the supported RPC boundary with representative assertions:

```sql
select lives_ok(
  $$ select * from public.reserve_board_image(
       '30000000-0000-4000-8000-000000000003',
       'poster.png', 'image/png', 10485760
     ) $$,
  'owner reserves a 10 MB PNG'
);

select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[10485760::bigint],
  'reserved bytes count immediately'
);

select throws_ok(
  $$ select * from public.reserve_board_image(
       '30000000-0000-4000-8000-000000000003',
       'overflow.png', 'image/png', 41943041
     ) $$,
  'P0001', 'image_quota_exceeded',
  'the account cannot exceed 50 MB'
);
```

Also assert zero/oversized files, rejected MIME, foreign board, 21st row, expired finalize, size-growth overflow, idempotent ready finalize, cancel release, delete release, board cascade release, direct attachment mutation denial, and direct `storage_bytes` update denial. Modify the Phase 2 attachment assertions to call `reserve_board_image` with `owner.png` and `image/png` because direct writes and PDFs are intentionally revoked.

- [ ] **Step 2: Run database tests to prove the migration is absent**

Run:

```bash
npx supabase db reset
npx supabase test db supabase/tests/phase2_rls.test.sql supabase/tests/phase5_board_images.test.sql
```

Expected: FAIL because the image RPCs and bucket do not exist.

- [ ] **Step 3: Implement constraints, private bucket, and quota triggers**

The migration must:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'board-images', 'board-images', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
revoke insert, update, delete on public.attachments from authenticated;
grant select on public.attachments to authenticated;
```

Replace the attachment size/state checks with named constraints that also allow only the four image MIME values. Add a private `before insert or update of size_bytes` trigger that locks `public.profiles FOR UPDATE`, calculates the byte delta, rejects totals outside `0..52428800`, and updates `storage_bytes`. Add an `after delete` trigger that subtracts `old.size_bytes` with `greatest(0, ...)`, covering cancel, ready delete, board cascade, and account cleanup.

- [ ] **Step 4: Implement least-privilege lifecycle RPCs**

Each function is `security definer set search_path = ''`, checks `auth.uid()`, schema-qualifies every relation, and raises only stable application codes such as `image_quota_exceeded`, `image_limit_exceeded`, `image_not_found`, or `image_reservation_expired`.

`reserve_board_image` generates `attachment_id := gen_random_uuid()`, verifies board ownership, counts active rows, and inserts:

```sql
storage_path := auth.uid()::text || '/' || p_board_id::text || '/' || attachment_id::text;
reservation_expires_at := now() + interval '15 minutes';
```

It returns `id`, `storage_path`, `original_filename`, `mime_type`, `size_bytes`, and `reservation_expires_at`. `finalize_board_image` locks the owned reservation, applies verified MIME/actual size, sets `state = 'ready'`, clears expiry, and returns the ready row; if already ready with identical metadata, return it unchanged. `cancel_board_image` deletes only an owned reserved row. `delete_board_image_record` deletes only an owned ready row and returns whether one row was removed. Revoke public execution and grant only the intended RPCs to `authenticated`.

- [ ] **Step 5: Regenerate and inspect TypeScript database types**

Run:

```bash
npx supabase gen types typescript --local > /tmp/informationboard-database.types.ts
```

Copy the generated `Database` definition into `src/lib/supabase/database.types.ts` and verify the four RPC argument/return signatures and attachment row types are present. Do not hand-edit unrelated generated declarations.

- [ ] **Step 6: Run database tests and typecheck**

Run:

```bash
npx supabase test db supabase/tests/phase2_rls.test.sql supabase/tests/phase5_board_images.test.sql
npm run typecheck
```

Expected: both SQL suites and typecheck PASS.

- [ ] **Step 7: Commit the database boundary**

```bash
git add supabase/migrations/20260729000100_board_images.sql supabase/tests/phase2_rls.test.sql supabase/tests/phase5_board_images.test.sql src/lib/supabase/database.types.ts
git commit -m "feat: enforce board image quotas"
```

---

### Task 3: Load Owner Image Libraries and Storage Usage

**Files:**
- Create: `src/features/boards/images/queries.ts`
- Create: `src/features/boards/images/queries.test.ts`

**Interfaces:**
- Consumes: `BoardImage`, `BoardImageLibrary`, and `boardImageUrl` from Task 1.
- Produces: `getBoardImageLibrary(ownerId: string, boardId: string, boardSlug: string): Promise<BoardImageLibrary | null>` for Task 8 page wiring.

- [ ] **Step 1: Write failing query tests**

Assert the query selects only owned, ready rows for the exact board, orders by `created_at asc`, separately selects the owner's `storage_bytes`, validates UUID/slug, and maps rows:

```ts
await expect(getBoardImageLibrary(ownerId, boardId, "summer-market"))
  .resolves.toEqual({
    storageBytes: 1_048_576,
    images: [{
      id: imageId,
      originalFilename: "poster.png",
      mimeType: "image/png",
      sizeBytes: 1_048_576,
      url: `/b/summer-market/images/${imageId}`,
    }],
  });
```

- [ ] **Step 2: Run focused tests and observe failure**

Run:

```bash
npm run test:run -- src/features/boards/images/queries.test.ts
```

Expected: FAIL because the library query and prop do not exist.

- [ ] **Step 3: Implement strict row mapping**

Use Zod to accept only ready rows with one of the four MIME types and positive sizes up to 10 MB. Fetch attachments and profile usage with the authenticated server client and return `null` on any error or malformed row. Keep this task limited to the independently testable read model; Task 8 connects it to the page after the UI prop exists.

- [ ] **Step 4: Run focused tests**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit the read model**

```bash
git add src/features/boards/images/queries.ts src/features/boards/images/queries.test.ts
git commit -m "feat: load board image libraries"
```

---

### Task 4: Implement Reservation, Direct Upload, Verification, and Cancellation

**Files:**
- Create: `src/features/boards/images/storage.ts`
- Create: `src/features/boards/images/storage.test.ts`
- Create: `src/features/boards/images/actions/reserve-image.ts`
- Create: `src/features/boards/images/actions/reserve-image.test.ts`
- Create: `src/features/boards/images/actions/finalize-image.ts`
- Create: `src/features/boards/images/actions/finalize-image.test.ts`
- Create: `src/features/boards/images/actions/cancel-image.ts`
- Create: `src/features/boards/images/actions/cancel-image.test.ts`
- Create: `src/features/boards/images/upload-image.ts`
- Create: `src/features/boards/images/upload-image.test.ts`
- Modify: `src/features/boards/images/queries.ts`
- Modify: `src/features/boards/images/queries.test.ts`

**Interfaces:**
- Consumes: Task 1 constants/types and Task 2 RPCs.
- Produces: `reserveBoardImage`, `finalizeBoardImage`, `cancelBoardImage`, `uploadBoardImage`, `cleanupExpiredBoardImages`, `verifyStoredImage`, and discriminated result unions consumed by Task 8.

- [ ] **Step 1: Write failing server lifecycle tests**

Cover invalid inputs before auth, owner auth path, expired cleanup before reserve, RPC error-code mapping, signed token creation with `upsert: false`, missing object, malformed bytes, MIME mismatch, actual-size adjustment, idempotent finalize, object cleanup on failure, safe errors, and path non-disclosure.

The success contracts are exact:

```ts
type ReserveBoardImageResult =
  | { status: "reserved"; attachmentId: string; path: string; token: string }
  | { status: "error"; code: "invalid" | "quota" | "limit" | "unavailable"; message: string };

type FinalizeBoardImageResult =
  | { status: "ready"; image: BoardImage; storageBytes: number }
  | { status: "error"; code: "invalid" | "expired" | "quota" | "unavailable"; message: string };

type CancelBoardImageResult = { status: "cancelled" } | { status: "error"; message: string };
```

- [ ] **Step 2: Write failing browser coordinator tests**

Inject a fake browser client and actions. Assert the exact order `reserve -> uploadToSignedUrl -> finalize`; on upload failure assert `cancel` is called once and finalize is not called:

```ts
expect(calls).toEqual(["reserve", "upload", "finalize"]);
expect(uploadToSignedUrl).toHaveBeenCalledWith(path, token, file, {
  contentType: "image/png",
  upsert: false,
});
```

Also cover browser-side zero byte, 10 MB, MIME, visible remaining quota, and 20-image validation without calling reserve.

- [ ] **Step 3: Run focused tests and observe failure**

Run:

```bash
npm run test:run -- src/features/boards/images/storage.test.ts src/features/boards/images/actions/reserve-image.test.ts src/features/boards/images/actions/finalize-image.test.ts src/features/boards/images/actions/cancel-image.test.ts src/features/boards/images/upload-image.test.ts
```

Expected: FAIL because lifecycle modules do not exist.

- [ ] **Step 4: Implement storage verification and expiry cleanup**

`verifyStoredImage(path)` uses the admin client to download the object, rejects size outside `1..10485760`, and runs:

```ts
const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 })
  .metadata();
const mimeType = ({ jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" } as const)[metadata.format as "jpeg" | "png" | "webp" | "gif"];
if (!mimeType) throw new InvalidStoredImageError();
```

Return verified bytes and MIME only; never trust the filename or upload header. `cleanupExpiredBoardImages(ownerId, authenticatedClient)` selects the owner's expired reserved rows with the admin client, removes their exact objects, then invokes `cancel_board_image` through the authenticated client per row. If object removal fails, retain the row/quota and return a cleanup failure so reservation does not silently continue. Call this helper before both reservation and `getBoardImageLibrary` so opening the panel also reclaims stale quota.

- [ ] **Step 5: Implement the three server actions**

All inputs use strict Zod schemas and call `requireUser(/boards/${boardId}/edit)`. `reserveBoardImage` normalizes the display filename, cleans expired rows, calls `reserve_board_image`, then calls `createSignedUploadUrl(storage_path, { upsert: false })`; if signing fails, cancel the reservation.

`finalizeBoardImage` loads the owned reserved row, verifies its stored object, calls `finalize_board_image` with verified MIME and bytes, maps the returned ready row with the board slug, and reads current profile usage. On verification/finalize failure, remove the object and cancel the reserved row.

`cancelBoardImage` first resolves the owned reserved row so the client cannot supply a path, removes the object idempotently, then calls `cancel_board_image`.

- [ ] **Step 6: Implement the browser upload coordinator**

Use `createBrowserSupabaseClient()` only after client validation passes:

```ts
const reserved = await reserveAction({
  boardId,
  originalFilename: file.name,
  mimeType: file.type,
  sizeBytes: file.size,
});
if (reserved.status !== "reserved") return reserved;
const upload = await supabase.storage
  .from(IMAGE_BUCKET)
  .uploadToSignedUrl(reserved.path, reserved.token, file, {
    contentType: file.type,
    upsert: false,
  });
if (upload.error) {
  await cancelAction({ boardId, attachmentId: reserved.attachmentId });
  return { status: "error", message: "이미지를 업로드하지 못했습니다. 다시 시도해 주세요." };
}
return finalizeAction({ boardId, attachmentId: reserved.attachmentId });
```

- [ ] **Step 7: Run focused tests**

Run the Step 3 command. Expected: PASS.

- [ ] **Step 8: Commit the upload lifecycle**

```bash
git add src/features/boards/images/storage.ts src/features/boards/images/storage.test.ts src/features/boards/images/actions/reserve-image.ts src/features/boards/images/actions/reserve-image.test.ts src/features/boards/images/actions/finalize-image.ts src/features/boards/images/actions/finalize-image.test.ts src/features/boards/images/actions/cancel-image.ts src/features/boards/images/actions/cancel-image.test.ts src/features/boards/images/upload-image.ts src/features/boards/images/upload-image.test.ts src/features/boards/images/queries.ts src/features/boards/images/queries.test.ts
git commit -m "feat: add verified image upload lifecycle"
```

---

### Task 5: Implement Reference-Safe Image and Board Deletion

**Files:**
- Create: `src/features/boards/images/actions/delete-image.ts`
- Create: `src/features/boards/images/actions/delete-image.test.ts`
- Modify: `src/features/boards/actions/delete-board.ts`
- Modify: `src/features/boards/actions/delete-board.test.ts`

**Interfaces:**
- Consumes: `hasBoardImageReference` from Task 1, admin storage removal from Task 4, and `delete_board_image_record` from Task 2.
- Produces: `deleteBoardImage({boardId, attachmentId})` returning `deleted`, `in_use`, or safe `error`; board deletion with storage cleanup.

- [ ] **Step 1: Write failing image deletion tests**

Assert invalid IDs fail before auth; foreign/missing images use a generic safe result; only an owned ready row is considered; saved Markdown image nodes block deletion; plain text and links with the same URL do not; storage removal happens before RPC deletion; a missing object is treated idempotently; storage failure retains metadata/quota; and successful deletion returns current `storageBytes`.

```ts
expect(await deleteBoardImage({ boardId, attachmentId })).toEqual({
  status: "in_use",
  message: "본문에서 이 이미지를 먼저 제거하고 저장해 주세요.",
});
expect(remove).not.toHaveBeenCalled();
expect(rpc).not.toHaveBeenCalled();
```

- [ ] **Step 2: Extend failing board deletion tests**

Mock owned attachment paths. Assert one batched `storage.from(IMAGE_BUCKET).remove(paths)` call occurs before the existing board delete, no storage call occurs for a board without images, storage failure prevents the database delete, and database failure after object removal remains a safe retryable error.

- [ ] **Step 3: Run focused tests and observe failure**

Run:

```bash
npm run test:run -- src/features/boards/images/actions/delete-image.test.ts src/features/boards/actions/delete-board.test.ts
```

Expected: FAIL because safe deletion is not implemented.

- [ ] **Step 4: Implement image deletion**

Authenticate, load the owned attachment plus board `slug` and latest `content_markdown`, build the exact stable URL, and parse Markdown with `hasBoardImageReference`. Return `in_use` before touching storage. Otherwise remove the server-resolved path, call `delete_board_image_record`, read the updated profile usage, and revalidate the editor/dashboard/public board paths.

- [ ] **Step 5: Add storage cleanup to board deletion**

Before deleting the row, select the board scoped to `user.id`, then select all of its attachment `storage_path` values. If the board is missing, preserve the current idempotent `deleted` result. Remove non-empty paths through the admin client and only then perform the owner-scoped board delete. The attachment delete trigger releases quota during cascade.

- [ ] **Step 6: Run focused tests**

Run the Step 3 command. Expected: PASS.

- [ ] **Step 7: Commit safe deletion**

```bash
git add src/features/boards/images/actions/delete-image.ts src/features/boards/images/actions/delete-image.test.ts src/features/boards/actions/delete-board.ts src/features/boards/actions/delete-board.test.ts
git commit -m "feat: safely delete board images"
```

---

### Task 6: Deliver Authorized Images and Render Safe Markdown Images

**Files:**
- Create: `src/features/boards/images/delivery.ts`
- Create: `src/features/boards/images/delivery.test.ts`
- Create: `src/app/b/[slug]/images/[attachmentId]/route.ts`
- Create: `src/app/b/[slug]/images/[attachmentId]/route.test.ts`
- Modify: `src/features/boards/markdown/url.ts`
- Modify: `src/features/boards/markdown/url.test.ts`
- Modify: `src/features/boards/markdown/board-markdown.tsx`
- Modify: `src/features/boards/markdown/board-markdown.test.tsx`

**Interfaces:**
- Consumes: Task 1 stable URL/MIME contract, existing `getPublicBoardBySlug`, `getPasswordBoardBySlug`, access-cookie verification, server/admin Supabase clients.
- Produces: `getDeliverableBoardImage(slug, attachmentId)` and `GET` route response; `sanitizeBoardImageUrl(input)`.

- [ ] **Step 1: Write failing authorization and route tests**

Cover exact slug/attachment matching, ready-only state, authenticated owner draft/private access, published public anonymous access, valid password cookie access, invalid/missing password cookie denial, foreign slug denial, draft/private anonymous denial, and generic 404 for malformed/missing data.

For success, mock admin `download` and assert:

```ts
expect(response.status).toBe(200);
expect(response.headers.get("content-type")).toBe("image/png");
expect(response.headers.get("x-content-type-options")).toBe("nosniff");
expect(response.headers.get("cache-control")).toContain("private");
expect(await response.arrayBuffer()).toEqual(expectedBytes);
```

Assert the response and body never contain `storage_path`.

- [ ] **Step 2: Write failing renderer tests**

Assert local stable and HTTPS image Markdown render `<img>` with alt text, `loading="lazy"`, and `decoding="async"`; `javascript:`, `data:`, `mailto:`, malformed local paths, raw HTML images, and SVG data URLs render no image.

- [ ] **Step 3: Run focused tests and observe failure**

Run:

```bash
npm run test:run -- src/features/boards/images/delivery.test.ts src/app/b/\[slug\]/images/\[attachmentId\]/route.test.ts src/features/boards/markdown/url.test.ts src/features/boards/markdown/board-markdown.test.tsx
```

Expected: FAIL because delivery and image rendering do not exist.

- [ ] **Step 4: Implement authorization without redirects**

Do not call `requireUser` in a media route. Read optional claims from the server client. Authorize in this order: an owned board/ready attachment through owner RLS; a published public board through the public query plus an exact admin attachment lookup; a published password board through `getPasswordBoardBySlug`, cookie verification, and exact admin attachment lookup. Return only `{ storagePath, mimeType, sizeBytes }` after authorization.

The route validates params, calls the helper, downloads through the admin client, verifies blob size is the recorded size, and responds with the recorded MIME, `Content-Length`, `X-Content-Type-Options: nosniff`, and `Cache-Control: private, max-age=300`. All denied/error paths return `new Response(null, { status: 404 })`.

- [ ] **Step 5: Extend sanitized Markdown rendering**

Add `img` to allowed elements and `src`, `alt`, `title` to the sanitize schema. Use a separate transform:

```ts
export function sanitizeBoardImageUrl(input: string): string {
  const value = input.trim();
  if (/^\/b\/[a-z0-9]+(?:-[a-z0-9]+)*\/images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : "";
  } catch {
    return "";
  }
}
```

Because React Markdown has one `urlTransform`, accept a `key` argument and route `src` through `sanitizeBoardImageUrl` while keeping `href` on `sanitizeBoardUrl`. Render images with a component that applies the same sanitizer and accessibility-preserving `alt`.

- [ ] **Step 6: Run focused tests**

Run the Step 3 command. Expected: PASS.

- [ ] **Step 7: Commit delivery and rendering**

```bash
git add src/features/boards/images/delivery.ts src/features/boards/images/delivery.test.ts src/app/b/\[slug\]/images/\[attachmentId\]/route.ts src/app/b/\[slug\]/images/\[attachmentId\]/route.test.ts src/features/boards/markdown/url.ts src/features/boards/markdown/url.test.ts src/features/boards/markdown/board-markdown.tsx src/features/boards/markdown/board-markdown.test.tsx
git commit -m "feat: deliver authorized board images"
```

---

### Task 7: Add Rich and Source Image Insertion to the Editor Controller

**Files:**
- Modify: `src/features/boards/editor/markdown-editor/types.ts`
- Modify: `src/features/boards/editor/markdown-editor/milkdown-editor.ts`
- Modify: `src/features/boards/editor/markdown-editor/milkdown-editor.test.ts`
- Modify: `src/features/boards/editor/markdown-editor/markdown-content-editor.tsx`
- Modify: `src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx`

**Interfaces:**
- Consumes: stable image URL and `BoardImage` from Task 1.
- Produces: controller command `run("image", {src, alt})`, `onOpenImageLibrary`, and `insertImage(image, alt)` behavior for Task 8.

- [ ] **Step 1: Write failing Milkdown command tests**

Add `image` to the command union and default toolbar state. Assert `controller.run("image", { src: url, alt: "행사 포스터" })` inserts Markdown at the current selection and publishes the new Markdown, and rejects absent/unsafe `src` without changing content. Assert undo removes the insertion.

- [ ] **Step 2: Write failing component insertion tests**

Extend the fake controller. In rich mode, assert an insertion request calls:

```ts
expect(editor.run).toHaveBeenCalledWith("image", {
  src: `/b/summer-market/images/${imageId}`,
  alt: "행사 포스터",
});
expect(editor.focus).toHaveBeenCalled();
```

In source mode, set textarea selection after `첫 줄\n`, insert the same image, and expect `첫 줄\n![행사 포스터](/b/summer-market/images/<id>)\n둘째 줄`. Cover Markdown escaping for `]`, `(`, `)`, and backslashes in alt text, the 200,000-character limit, decorative empty alt, and no document mutation when insertion fails.

- [ ] **Step 3: Run focused editor tests and observe failure**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/milkdown-editor.test.ts src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx
```

Expected: FAIL because the image command and insertion bridge are absent.

- [ ] **Step 4: Implement the Milkdown image command**

Import `insertImageCommand` from CommonMark. Extend payload typing to:

```ts
type MarkdownEditorPayload = { href?: string; src?: string; alt?: string };
```

For `image`, require `sanitizeBoardImageUrl(src)` to equal the submitted source and call `callCommand(insertImageCommand.key, { src, alt, title: "" })`. Set image toolbar state to `{ active: false, enabled: true }`; it is an insertion action and never has pressed semantics.

- [ ] **Step 5: Implement selection-preserving insertion in the component**

Keep a `sourceRef`. Add an `insertImage(image, alt)` callback that uses the controller in rich mode and textarea `selectionStart/selectionEnd` in source mode. Serialize source Markdown with a focused `escapeMarkdownAlt` helper, add surrounding newlines only when adjacent content requires them, refuse over-limit output, update `latestValueRef`, `sourceValue`, and `onChange`, then restore the source selection in `requestAnimationFrame`.

Do not render the panel yet. Expose the callback to a render prop:

```ts
imageLibrary?: (insertImage: (image: BoardImage, alt: string) => boolean) => React.ReactNode;
```

- [ ] **Step 6: Run focused editor tests**

Run the Step 3 command. Expected: PASS.

- [ ] **Step 7: Commit editor insertion**

```bash
git add src/features/boards/editor/markdown-editor/types.ts src/features/boards/editor/markdown-editor/milkdown-editor.ts src/features/boards/editor/markdown-editor/milkdown-editor.test.ts src/features/boards/editor/markdown-editor/markdown-content-editor.tsx src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx
git commit -m "feat: insert images in markdown editor"
```

---

### Task 8: Build and Wire the Image Library UI

**Files:**
- Create: `src/features/boards/images/image-library.tsx`
- Create: `src/features/boards/images/image-library.test.tsx`
- Modify: `src/features/boards/editor/markdown-editor/markdown-content-editor.tsx`
- Modify: `src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx`
- Modify: `src/features/boards/editor/board-editor.tsx`
- Modify: `src/features/boards/editor/board-editor.test.tsx`
- Modify: `src/app/boards/[id]/edit/page.tsx`
- Modify: `src/app/boards/[id]/edit/page.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: Task 3 initial library; Task 4 upload actions/coordinator; Task 5 delete action; Task 7 insertion render prop.
- Produces: complete owner-facing upload/list/insert/delete workflow.

- [ ] **Step 1: Write failing image library component tests**

Render two ready images and assert heading, usage `1 MB / 50 MB`, remaining storage, per-file/count help, filename, formatted size, thumbnail URL, editable alt input, a `장식용 이미지` checkbox, insert, and delete buttons. Cover successful upload appending a row/updating usage; browser validation errors; disabled upload while pending/full/20 rows; retryable upload error; delete confirmation; current unsaved Markdown reference blocking before the action; server `in_use`; successful removal/usage update; and failed deletion retaining the row. Assert empty alt text is rejected unless the decorative checkbox is selected; selecting it disables the alt input and inserts `alt=""`.

Use accessible interactions:

```ts
await user.upload(screen.getByLabelText("이미지 추가"), imageFile);
expect(screen.getByRole("status")).toHaveTextContent("업로드 중");
await user.click(screen.getByRole("button", { name: "poster.png 삽입" }));
expect(onInsert).toHaveBeenCalledWith(image, "poster");
```

- [ ] **Step 2: Write failing toolbar and BoardEditor wiring tests**

Assert an icon-only `이미지` button with `data-tooltip="이미지"` appears in both rich and source modes, toggles an `aria-expanded` panel, and closes on Escape. Assert `BoardEditor` passes current `draft.contentMarkdown`, initial image data, board ID/slug, and all four actions while existing autosave tests stay unchanged.

- [ ] **Step 3: Run focused component tests and observe failure**

Run:

```bash
npm run test:run -- src/features/boards/images/image-library.test.tsx src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx src/features/boards/editor/board-editor.test.tsx src/app/boards/\[id\]/edit/page.test.tsx
```

Expected: FAIL because the library UI and wiring do not exist.

- [ ] **Step 4: Implement the image library state machine**

`ImageLibrary` receives:

```ts
type ImageLibraryProps = {
  boardId: string;
  boardSlug: string;
  initialLibrary: BoardImageLibrary;
  contentMarkdown: string;
  onInsert(image: BoardImage, alt: string): boolean;
  uploadImage?: typeof uploadBoardImage;
  reserveImageAction: typeof reserveBoardImage;
  finalizeImageAction: typeof finalizeBoardImage;
  cancelImageAction: typeof cancelBoardImage;
  deleteImageAction: typeof deleteBoardImage;
};
```

Own local `images`, `storageBytes`, selected file, per-image alt text/decorative state, pending operation, delete confirmation ID, and one live-region message. Validate before upload, call the coordinator with the injected reserve/finalize/cancel actions, append only a `ready` result, and clear the file input by incrementing an input key. Require non-empty alt text unless decorative is selected. Before deletion, call `hasBoardImageReference(contentMarkdown, image.url)`; otherwise confirm and invoke the server action. Never optimistically remove a row before server success.

- [ ] **Step 5: Add toolbar/panel integration and page actions**

Import Lucide `Image` as `ImageIcon`. Add a separate insertion toolbar group visible in both modes:

```tsx
<button
  aria-expanded={imagePanelVisible}
  aria-label="이미지"
  data-tooltip="이미지"
  onClick={() => setImagePanelVisible((visible) => !visible)}
  type="button"
>
  <ImageIcon aria-hidden="true" size={18} strokeWidth={2} />
</button>
```

Render the supplied library below the toolbar only while open and pass its insert callback. In the page, load the board first, call `getBoardImageLibrary(user.id, board.id, board.slug)`, and call `notFound()` if the owned library cannot be loaded so internal query details never render. Pass `initialImageLibrary` through `BoardEditor`, and inject `reserveBoardImage`, `finalizeBoardImage`, `cancelBoardImage`, and `deleteBoardImage`; client upload remains coordinated inside `ImageLibrary` rather than passing a `File` to a server action. Update the page test to assert owner/board/slug query arguments, click the `이미지` toolbar button, and verify visible `0 B / 50 MB` library usage.

- [ ] **Step 6: Add responsive and rendered-image CSS**

Create focused classes for a bordered library panel, usage meter, wrapping controls, 96px object-fit thumbnails, status/error copy, two-column cards at desktop, one column below 720px, and minimum 44px touch targets. Add `.board-markdown img { display: block; max-width: 100%; height: auto; }`. Preserve the existing toolbar group wrapping and focus-visible outlines.

- [ ] **Step 7: Run focused component tests**

Run the Step 3 command. Expected: PASS.

- [ ] **Step 8: Commit the owner UI**

```bash
git add src/features/boards/images/image-library.tsx src/features/boards/images/image-library.test.tsx src/features/boards/editor/markdown-editor/markdown-content-editor.tsx src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx src/features/boards/editor/board-editor.tsx src/features/boards/editor/board-editor.test.tsx src/app/boards/\[id\]/edit/page.tsx src/app/boards/\[id\]/edit/page.test.tsx src/app/globals.css
git commit -m "feat: add board image library UI"
```

---

### Task 9: Add End-to-End Coverage, Documentation, and Release Verification

**Files:**
- Create: `tests/e2e/board-images.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: complete Tasks 1-8 workflow and existing live-owner Playwright support.
- Produces: user-level acceptance evidence and deployment/operator documentation.

- [ ] **Step 1: Write the authenticated end-to-end scenario**

Use the existing live-owner setup and a small committed or runtime-generated PNG fixture. The test must:

```ts
await page.getByRole("button", { name: "이미지" }).click();
await page.getByLabel("이미지 추가").setInputFiles(pngFixture);
await expect(page.getByText("업로드 완료")).toBeVisible();
await page.getByRole("button", { name: /삽입/ }).click();
await expect(page.getByRole("img", { name: "E2E poster" })).toBeVisible();
```

Then wait for `저장됨`, reload, verify the image remains in editor preview, publish public and verify anonymous delivery, fetch the same route while private and expect 404, remove the Markdown reference, wait for save, delete the image, and assert the displayed storage total decreases by the exact fixture byte count. Add a password-board case that is 404 before unlock and 200 after the scoped cookie is set.

- [ ] **Step 2: Run the focused E2E test against the configured live project**

Run:

```bash
npm run test:e2e -- tests/e2e/board-images.spec.ts
```

Expected: PASS when live owner credentials and Supabase configuration are present; otherwise the existing live-owner guard must skip with its established actionable reason.

- [ ] **Step 3: Document deployment and limits**

Update README sections for Supabase setup and testing with:

- migration `20260729000100_board_images.sql` creates the private bucket and RPC boundary;
- accepted MIME values, 10 MB/image, 20 images/board, 50 MB/account;
- `storage_bytes` includes reservations immediately;
- image URLs inherit public/password/private board access;
- the exact focused pgTAP and Playwright commands from this plan;
- the requirement to apply migrations before deploying the app.

- [ ] **Step 4: Run the full completion audit**

Run in order and retain the output:

```bash
npx supabase db reset
npx supabase test db supabase/tests/phase2_rls.test.sql supabase/tests/phase4_publishing.test.sql supabase/tests/phase4_password_access.test.sql supabase/tests/phase5_board_images.test.sql
npm run verify
npm run test:e2e -- tests/e2e/board-images.spec.ts tests/e2e/board-owner.spec.ts tests/e2e/publishing.spec.ts
npm audit --audit-level=high
git diff --check
git status --short
```

Expected: database suites pass; lint, typecheck, Vitest, build, and secret scan pass; configured E2E scenarios pass (or use only their established credential skip); audit reports no high/critical vulnerabilities; diff check is clean; status contains only intentional files.

- [ ] **Step 5: Perform desktop and narrow visual checks**

Run `npm run dev`, open an owned editor at 1280px and 390px widths, and verify: toolbar wraps without page overflow; panel controls and 44px targets remain reachable; thumbnail aspect ratios are stable; upload/error/confirmation focus is visible; inserted images fit both editor preview and public board; Korean copy is not clipped. Record any discovered regression as a failing component or Playwright assertion before fixing it.

- [ ] **Step 6: Commit acceptance coverage and docs**

```bash
git add tests/e2e/board-images.spec.ts README.md
git commit -m "test: cover board image workflow"
```

---

## Completion Evidence Matrix

| Requirement | Authoritative evidence |
| --- | --- |
| 50 MB per account, including reservations | Phase 5 pgTAP quota/parallel reservation cases; 50 MB component assertions |
| Upload JPEG/PNG/WebP/GIF up to 10 MB | Bucket migration, Sharp verification tests, lifecycle action tests, E2E PNG upload |
| Add/list/delete images and manage usage | Query/action/component tests and E2E usage delta |
| No more than 20 images per board | Phase 5 pgTAP 21st-reservation failure and disabled UI test |
| Insert uploaded image inside writing | Milkdown/source selection tests and E2E persisted insertion |
| Toolbar access in rich and source modes | Markdown editor accessible toolbar tests at both modes |
| Safe deletion without broken references | AST helper tests, server saved-reference test, client unsaved-reference test |
| Public/password/private image authorization | Delivery unit/route tests and public/password E2E cases |
| Board deletion releases bytes and objects | pgTAP cascade test and delete-board storage ordering tests |
| No unsafe image rendering or path leakage | Markdown sanitizer tests, delivery 404/headers/body tests |
| Responsive accessible owner UI | Component accessibility assertions and 1280px/390px visual checks |
| Repository release health | Full `npm run verify`, database suites, focused E2E, audit, diff/status evidence |
