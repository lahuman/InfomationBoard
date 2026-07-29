# InformationBoard Image Library and Editor Insertion Design

Date: 2026-07-29
Status: Approved in conversation; awaiting written-spec review

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
- Quota is owned by the account. Reserved and completed images across all of an
  owner's boards count toward the same 50 MB total.
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

The browser uploads directly to Supabase Storage using a short-lived signed
upload token. A Next.js server action creates the reservation and token, and a
second server action verifies and finalizes the stored image. This keeps the
binary request body out of the Next.js deployment while preserving
server-authoritative limits.

Markdown stores a stable application URL based on the attachment identifier,
not a temporary Storage URL. A Next.js image route authorizes every request
against the parent board, reads the private object with the server-only Storage
client, and streams the verified bytes. Public, password-protected, private,
draft, and owner access therefore follow the same rules as the board itself.

## 4. Database and Storage Design

### Limits

- Account limit: `52,428,800` bytes (50 MiB).
- Per-image limit: `10,485,760` bytes (10 MiB).
- Per-board limit: 20 reserved or ready image rows.
- Reservation lifetime: 15 minutes.

UI copy uses MB consistently with the existing binary byte formatter.

### Attachment rows

The existing attachment columns remain sufficient:

- `id`, `board_id`, and `owner_id` establish identity and ownership;
- `storage_path` is a random server-generated path and never includes an
  untrusted filename;
- `original_filename`, `mime_type`, and `size_bytes` hold verified display
  metadata;
- `state` is `reserved` during upload and `ready` after verification;
- `reservation_expires_at` is present only while reserved.

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
from bypassing the quota. Failed uploads explicitly cancel their reservation.
Expired reservations and any matching objects are reclaimed by the server
before subsequent list or reservation operations. A scheduler is not required
for the first release.

### Storage bucket

The migration creates a private `board-images` bucket with a 10 MB object limit
and the JPEG, PNG, WebP, and GIF MIME allowlist. Paths have the form
`<owner-id>/<board-id>/<attachment-id>`.

Clients receive only a signed upload token for the exact reserved path. They do
not receive general list, overwrite, move, or delete access. Server actions use
the existing server-only administrative client for verification and cleanup.

## 5. Upload Flow

1. The owner chooses one image in the board image panel.
2. The client validates non-empty size, the 10 MB limit, accepted browser MIME,
   the visible remaining quota, and the 20-image board limit.
3. The reservation action authenticates the user and validates all inputs.
4. The database atomically reserves quota and returns a random attachment ID
   and storage path.
5. The server returns a short-lived signed upload token for that exact path.
6. The browser uploads directly to the private bucket and reports progress or a
   clear uploading state.
7. The finalize action downloads the stored object with the server-only client
   and decodes it with `sharp` to prove it is a JPEG, PNG, WebP, or GIF. It also
   verifies actual byte size and rejects a zero-byte, oversized, mismatched, or
   malformed file.
8. If actual size differs from the reservation, finalization adjusts quota
   atomically only when the final total still fits 50 MB.
9. The attachment becomes `ready`, its expiry is cleared, and the refreshed
   image appears in the panel and storage meter.
10. Any failure removes the object when present and cancels the reservation so
    the owner can retry without losing quota.

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

The stable source URL is `/images/<attachment-id>`. The default alt text is the
original filename without its final extension, and the owner can edit the alt
text before insertion. Empty alt text is allowed only when the owner explicitly
marks the image decorative.

Insertion respects the existing maximum Markdown length. If the generated
Markdown would exceed that limit, the document is unchanged and the editor
shows its character-limit message. Undo and redo treat insertion as a normal
editor transaction. Markdown source mode can insert the equivalent syntax at
the textarea selection and remains round-trip compatible with rich mode.

The existing Markdown renderer continues to disallow raw HTML. Its image URL
policy is extended only for the stable local attachment route and already-safe
HTTP(S) images; unsafe protocols remain rejected.

## 8. Image Delivery and Access Control

`GET /images/<attachment-id>` resolves only a ready attachment. The handler
loads the parent board and applies these decisions:

- the authenticated owner can view images on their own board in any state;
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
`content_markdown`, and checks for the exact stable attachment URL in parsed
Markdown image nodes. Text that merely resembles the URL does not block
deletion. If referenced, the action returns a specific `in_use` result and does
not modify storage, metadata, or quota.

The editor also checks its current unsaved draft before sending a delete
request. This closes the autosave window in which a newly inserted local image
reference is not yet present in the saved board. The server check remains
authoritative for references saved from any other tab.

For an unused image, the action removes the Storage object first and then
deletes the attachment row, which releases quota through the database trigger.
If object removal succeeds but row deletion fails, retry recognizes the missing
object and completes the metadata cleanup. If object removal fails, the row and
quota remain intact so the operation can be retried without creating an orphan.

Board deletion first enumerates and removes its Storage objects, then deletes
the board. Cascading attachment deletion releases all associated quota. A
failed storage cleanup prevents board deletion and returns a retryable error.

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
- Cancellation and deletion are idempotent for already-absent objects when the
  authenticated attachment record establishes the intended target.

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

- reservation, signed upload creation, finalize, cancellation, retry, and
  deletion map each expected result to safe errors;
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
of reserved plus ready images; an owner can upload, view, insert, and safely
delete board images; the dashboard and editor show accurate usage; rich and
source editing preserve inserted image Markdown; image delivery follows the
parent board's access rules; failures do not leak data, strand quota, or create
silent broken references; and the database, component, server, build, and
end-to-end verification gates pass.
