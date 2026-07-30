# InformationBoard Image Library and Editor Insertion Design

Date: 2026-07-29
Status: Approved

## 1. Goal

Add a secure image workflow to InformationBoard so each signed-in owner can
upload, inspect, insert, and delete images while managing a 50 MB account-wide
allowance. Uploaded images belong to one board and can be inserted at the
current position in that board's rich Markdown editor.

This design replaces the earlier 100 MB beta allowance with 50 MB. It narrows
the first attachment release to inline images only; general file attachments
remain deferred. The existing 10 MB per-file and 20-images-per-board limits
remain in force.

## 2. Confirmed Product Behavior

- Images are owned by a board. An image uploaded to one board is not offered in
  another board's image picker.
- Quota is owned by the account. Reserved, transiently cancelling, and ready
  images across all of an owner's boards count toward the same 50 MB total.
- Accepted formats are JPEG, PNG, WebP, and GIF. SVG is excluded because it can
  contain active content.
- The browser rejects obviously invalid selections early, but database and
  server checks are authoritative.
- The editor exposes an image button alongside the existing insert tools.
- The image panel lists the board's uploaded images, their names and sizes, and
  offers upload, insert, and delete actions.
- Inserting an image writes normal Markdown image syntax at the current rich
  editor selection. Source mode continues to show and edit that Markdown.
- An image referenced by the board's current Markdown cannot be deleted. The
  owner must remove every reference from the body and let that edit save first.
- Deleting an unused image releases its quota immediately after the storage
  object and attachment record are both removed.

## 3. Architecture

The feature uses the existing `public.profiles`, `public.boards`, and
`public.attachments` boundaries. Supabase Storage holds the image bytes in one
private `board-images` bucket. PostgreSQL remains authoritative for ownership,
reservation state, and quota accounting.

The authenticated browser uploads directly to Supabase Storage after a Next.js
server action creates a database reservation. A narrowly scoped Storage INSERT
policy permits only the exact path of the caller's live owned reservation; it
does not grant list, overwrite, update, move, or delete access. A second server
action verifies and finalizes the stored image. This keeps the binary request
body out of the Next.js deployment while preserving server-authoritative
limits.

Markdown stores a stable application URL based on the attachment identifier,
not a temporary Storage URL. A Next.js image route authorizes every request
against the parent board, reads the private object with the server-only Storage
client, and streams the verified bytes. Public, password-protected, private,
draft, and owner access therefore follow the same rules as the board itself.

## 4. Database and Storage Design

### Limits

- Account limit: `52,428,800` bytes (50 MiB).
- Per-image limit: `10,485,760` bytes (10 MiB).
- Per-board limit: 20 reserved, cancelling, or ready image rows.
- Reservation lifetime: 15 minutes.

UI copy uses MB consistently with the existing binary byte formatter.

### Attachment rows

The existing attachment columns remain sufficient:

- `id`, `board_id`, and `owner_id` establish identity and ownership;
- `storage_path` is a random server-generated path and never includes an
  untrusted filename;
- `original_filename`, `mime_type`, and `size_bytes` hold verified display
  metadata;
- `state` is `reserved` during upload, `cancelling` while server cleanup owns
  the object-removal claim, and `ready` after verification;
- `reservation_expires_at` is present while reserved or cancelling.

A forward-only migration tightens the table to the accepted image MIME types,
keeps the 10 MB size constraint, and adds the functions and triggers needed for
atomic quota accounting. There is no client-written `storage_bytes` value.

### Atomic quota accounting

Reservation creation runs in one database transaction. It locks the owner's
profile row, verifies board ownership and the per-board count, checks
`storage_bytes + requested_size <= 50 MiB`, inserts the reserved attachment,
and increments `storage_bytes`. Concurrent reservations for one owner are
serialized by the profile lock, so two simultaneous uploads cannot overspend
the allowance.

Deleting any attachment row decrements the matching profile usage by that
row's reserved size. This also covers board deletion and expired-reservation
cleanup. Constraints prevent a negative total. Direct authenticated writes to
quota-owned profile fields and attachment lifecycle fields are revoked; exposed
database functions are the supported mutation boundary.

Reserved bytes count immediately. This prevents parallel and abandoned uploads
from bypassing the quota. A `cancelling` row remains charged until trusted
completion deletes it, so failed object removal cannot release reusable quota.
Failed uploads explicitly cancel their reservation.
Expired reservations and any matching objects are reclaimed by the server
before subsequent list or reservation operations. A scheduler is not required
for the first release.

### Storage bucket

The migration creates a private `board-images` bucket with a 10 MB object limit
and the JPEG, PNG, WebP, and GIF MIME allowlist. Paths have the form
`<owner-id>/<board-id>/<attachment-id>`.

Authenticated clients may INSERT only when an unexpired owned attachment is
still `reserved` and `storage.objects.name` exactly equals its server-generated
path. There are no client Storage SELECT, UPDATE, UPSERT, DELETE, list, move, or
overwrite policies. Server actions use the existing server-only administrative
client for verification and cleanup.

## 5. Upload Flow

1. The owner chooses one image in the board image panel.
2. The client validates non-empty size, the 10 MB limit, accepted browser MIME,
   the visible remaining quota, and the 20-image board limit.
3. The reservation action authenticates the user and validates all inputs.
4. The database atomically reserves quota and returns a random attachment ID
   and storage path.
5. The server returns the reservation ID and exact server-generated path, with
   no reusable upload credential.
6. The authenticated browser uploads with `upsert: false`; Storage RLS admits
   only the live reservation path and reports progress or a clear uploading
   state.
7. The finalize action downloads the stored object with the server-only client
   and decodes it with `sharp` to prove it is a JPEG, PNG, WebP, or GIF. It also
   verifies actual byte size and rejects a zero-byte, oversized, mismatched, or
   malformed file.
8. If actual size differs from the reservation, finalization adjusts quota
   atomically only when the final total still fits 50 MB.
9. The attachment becomes `ready`, its expiry is cleared, and the refreshed
   image appears in the panel and storage meter.
10. A pre-finalize upload failure claims cancellation, transitions the row to
    `cancelling`, removes the object, and then deletes the row to release quota.
    A finalize transport failure first re-reads the owned row: a matching
    `ready` row recovers success, a confirmed `reserved` row may be cancelled,
    and an ambiguous read or `cancelling` row is retained for safe retry.
    Database finalization is explicitly `reserved`-only; a delayed or duplicate
    finalize receives a stable error for `cancelling` or `deleting` and cannot
    restore either lifecycle state to `ready`.

Only ready attachments can be inserted or served. An upload may not overwrite
an existing path.

## 6. Image Management UI

The board edit page loads ready images for that board plus account storage
usage. `BoardEditor` owns the image-panel state and passes an insertion callback
to `MarkdownContentEditor`.

The image panel opens from an icon-only `이미지` toolbar button with a Korean
accessible name and tooltip consistent with the existing toolbar. The panel
contains:

- a file chooser accepting JPEG, PNG, WebP, and GIF;
- used and available storage against 50 MB;
- the 10 MB per-image and 20-images-per-board limits;
- per-image thumbnail, original filename, formatted size, and upload status;
- `삽입` and `삭제` actions;
- inline, actionable error and retry feedback.

Upload controls are disabled while a request is active and when no additional
image can fit. Deleting one image requires explicit confirmation. A failed
delete remains visible and retryable. Object URLs used for pre-upload previews
are revoked when no longer needed.

The dashboard `StorageMeter` also changes to 50 MB and removes the statement
that uploads are unavailable.

## 7. Editor Insertion

The Milkdown controller gains one bounded operation that inserts an image node
at the current selection with an attachment URL and alt text. The editor image
button itself opens the image panel; choosing `삽입` invokes the controller
operation and returns focus to the document.

The stable source URL is `/b/<board-slug>/images/<attachment-id>`. Keeping the
route under `/b/<board-slug>` ensures the board-scoped password access cookie is
sent with image requests. The default alt text is the original filename without
its final extension, and the owner can edit the alt text before insertion.
Empty alt text is allowed only when the owner explicitly marks the image
decorative.

Insertion respects the existing maximum Markdown length. If the generated
Markdown would exceed that limit, the document is unchanged and the editor
shows its character-limit message. Undo and redo treat insertion as a normal
editor transaction. Markdown source mode can insert the equivalent syntax at
the textarea selection and remains round-trip compatible with rich mode.

The existing Markdown renderer continues to disallow raw HTML. Its image URL
policy is extended only for the stable local attachment route and already-safe
HTTP(S) images; unsafe protocols remain rejected.

## 8. Image Delivery and Access Control

`GET /b/<board-slug>/images/<attachment-id>` resolves only a ready attachment
belonging to that exact board slug. The handler loads the parent board and
applies these decisions:

- the authenticated owner can view ready images on their own board in any
  board lifecycle state;
- anonymous visitors can view images only when the parent board is published
  and public;
- a published password board requires the same valid scoped access cookie as
  its board page;
- private boards, drafts, missing rows, and unauthorized callers return the
  same generic not-found response.

Successful responses stream the private object through the authorized route and
set conservative cache headers. Public-board image responses may be privately
revalidated but must not make the underlying bucket public. Responses include
MIME-sniffing protection and never expose the storage path.

Deleting or unpublishing a board changes authorization on the next request to
this stable route. No reusable Storage URL is issued to the browser.

## 9. Safe Deletion and Lifecycle Cleanup

Before deletion, the action authenticates ownership, loads the latest saved
`content_markdown` and board revision, and checks for the exact stable
attachment URL in parsed Markdown image nodes. Both direct and reference-style
images count; text and ordinary links that merely contain the URL do not. If
referenced, the action returns a specific `in_use` result and does not modify
storage, metadata, or quota.

The editor also checks its current unsaved draft before sending a delete
request. This closes the autosave window in which a newly inserted local image
reference is not yet present in the saved board. The server check remains
authoritative for references saved from any other tab.

For an unused image, an authenticated RPC atomically claims
`ready -> deleting` and returns the exact owned path. The action removes that
object, then uses the admin client for a service-role-only completion that
deletes metadata and releases quota. Retrying a `deleting` row resumes the same
path. Exact object-missing is idempotent; any other removal failure preserves
the row and charged quota. Image library and delivery queries continue to
resolve only `ready` rows. Library cleanup separately resumes persisted
`deleting` rows, including after reload, without exposing them in the list.

The image claim locks the board, compares a required non-null saved revision,
and bumps/returns the revision with every post-claim action result. A save that
won the lock first makes the claim fail stale; a save that lost the lock keeps
its older optimistic revision and conflicts instead of committing a newly
referenced deleted image. If the claim response is thrown, malformed, or does
not match the requested server-resolved row, the action re-reads the board and
attachment authoritatively: `deleting` returns a retryable error with the
current revision, while an absent attachment returns `deleted` with that
revision. Once trusted completion succeeds, later usage refresh failure cannot
reverse the result; `deleted` may omit `storageBytes` so the UI removes the row
and refreshes or recomputes usage separately.

Board deletion first claims the owned board with `deletion_started_at`, making
it private and non-published, then enumerates every server-resolved attachment
path. After one batched Storage removal, a service-role-only completion deletes
the board and cascades its attachments. A failed Storage call leaves the claim,
metadata, and quota retryable. Authenticated users cannot directly delete the
board or update its claim column. If a retry receives a batch-level error, the
server checks each previously resolved path individually and accepts only
success or the exact object-missing response for every path before completing;
bucket, route, authorization, and other errors remain fail-closed.

Reservation already takes a `FOR KEY SHARE` board lock. The board claim first
takes `FOR UPDATE`, which conflicts with that lock, and the Storage INSERT
policy takes the same KEY SHARE lock while requiring an unclaimed board. Thus
an earlier reservation/upload is visible to post-claim path enumeration, while
later work cannot create an object after enumeration. Claimed boards are also
excluded from owner UPDATE RLS and password publication, so cleanup failure
cannot be followed by republishing.

## 10. Security and Failure Handling

- All server actions begin with authenticated user resolution and board-owner
  checks; client-provided owner IDs and storage paths are ignored.
- Filenames are normalized for display, stripped of path components and control
  characters, and length-limited. They never determine an object path.
- MIME headers and extensions are hints only. Successful image decoding is the
  final format check.
- Reservation and lifecycle RPCs use a fixed empty `search_path`, explicit
  schema qualification, minimal grants, and server-controlled values.
- Upload and delete errors use Korean user-facing messages without object paths,
  SQL details, keys, or stack traces.
- Network interruption leaves a cancelable or expiring reservation, never an
  uncounted object.
- Finalization is idempotent: retrying an already-ready attachment returns its
  current metadata rather than charging quota again.
- Cancellation atomically claims `reserved -> cancelling` before object
  removal. Retrying a `cancelling` row resumes the same exact path; completion
  deletes metadata and releases quota only after removal succeeds or Storage
  returns the exact `StorageApiError` 404 `Object not found` response.
- Cancellation completion accepts explicit owner, board, and attachment IDs,
  is executable only by `service_role`, and is called through the server-only
  admin client. Authenticated and anonymous clients cannot release a claimed
  row or its quota directly.
- Ready deletion mirrors that boundary with `deleting`: authenticated callers
  can claim only an exact owned ready/deleting row, while only `service_role`
  can complete after server-verified object removal. The former authenticated
  direct metadata deletion RPC does not exist.
- Board deletion completion is likewise service-role-only. Its persisted claim,
  reservation lock, and Storage INSERT lock close the path-enumeration race and
  prevent direct cascade deletion from bypassing object cleanup.
- Finalization refuses `cancelling` rows, so cleanup and readiness cannot race.

## 11. Testing and Verification

Implementation is test-driven.

### Database tests

- a reservation within 50 MB succeeds and increments usage;
- a reservation above 50 MB fails without inserting or changing usage;
- concurrent-style sequential reservations cannot exceed the locked quota;
- the 10 MB, accepted MIME, 20-per-board, ownership, state, and expiry rules are
  enforced server-side;
- cancellation, deletion, board cascade, and expired cleanup release exactly
  the correct bytes;
- authenticated users cannot edit `storage_bytes` or another owner's rows.

### Server tests

- reservation, authenticated exact-path upload, finalize response-loss
  recovery, cancellation claims, retry, and deletion map each expected result
  to safe errors;
- malformed or MIME-mismatched image bytes are removed and quota is released;
- only ready images are returned by editor queries and delivery routes;
- public, password, private, draft, owner, missing, and unauthorized delivery
  cases follow board access rules;
- a parsed Markdown image reference blocks deletion while unrelated text does
  not;
- board deletion cleans up image objects before database cascade.

### Component and editor tests

- storage meters show 50 MB and accurate remaining usage;
- the image toolbar button has correct icon, label, tooltip, and disabled state;
- upload validation, progress, success, error, retry, and confirmation states
  are accessible;
- the panel lists only the current board's images;
- rich and source modes insert at their current selections with editable alt
  text and obey the Markdown length limit;
- inserted Markdown survives autosave, recovery, preview, and rich/source
  round trips;
- an in-use delete result leaves the image visible with actionable guidance.

### End-to-end and release checks

- an authenticated owner uploads an image, inserts it, saves it, and sees it in
  preview and the allowed published view;
- an unauthorized visitor cannot fetch images from private or locked boards;
- removing the body reference and deleting the image updates the 50 MB meter;
- desktop and narrow viewport checks confirm the panel and toolbar remain
  usable without horizontal page overflow;
- Supabase database tests, focused Vitest suites, the full `npm run verify`, and
  the relevant Playwright scenarios pass.

## 12. Acceptance Criteria

The feature is complete when every account is authoritatively limited to 50 MB
of reserved, ready, and cancelling images; an owner can upload, view, insert,
and safely delete board images; the dashboard and editor show accurate usage; rich and
source editing preserve inserted image Markdown; image delivery follows the
parent board's access rules; failures do not leak data, strand quota, or create
silent broken references; and the database, component, server, build, and
end-to-end verification gates pass.
