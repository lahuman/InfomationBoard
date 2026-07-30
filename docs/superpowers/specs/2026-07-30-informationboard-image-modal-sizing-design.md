# InformationBoard Image Modal and Sizing Design

**Date:** 2026-07-30

## 1. Goal

Repair the image-library alternative-text crash, move image addition and
deletion into accessible modal flows, and let owners choose and later change an
image display width of 25%, 50%, 75%, or 100% without weakening the existing
image lifecycle and access controls.

## 2. Scope

This change covers the board editor, Markdown serialization, owner preview, and
published/sample Markdown rendering for board images. It keeps the existing
private Storage bucket, attachment delivery route, quota rules, upload actions,
and deletion actions.

The editor supports both new-image insertion and later editing of an existing
image's alternative text, decorative state, and width. Arbitrary pixel sizes,
freeform percentages, drag handles, image cropping, and image byte resizing are
out of scope.

## 3. Root Cause and Regression Boundary

The alternative-text input currently reads `event.currentTarget.value` from
inside a functional state updater. React may execute that updater after the
event handler has returned, at which point `currentTarget` is `null`. The
result is `TypeError: Cannot read properties of null (reading 'value')`.

The handler must copy the input value to a local string before scheduling the
state update. A regression test must exercise alternative-text editing on a
newly uploaded image and prove that the value remains editable without an
uncaught error.

## 4. Markdown Contract

Image width is stored in the standard Markdown image title position:

```markdown
![행사 포스터](/b/summer-market/images/<attachment-id> "width=50")
```

The only valid serialized values are `width=25`, `width=50`, `width=75`, and
`width=100`. New insertions always serialize a width, including 100%, so their
behavior is explicit and consistent. Existing images without width metadata,
or documents containing malformed or unsupported width metadata, render at
100% and are normalized to an allowed value when edited.

The title is editor metadata, not user-facing tooltip text. Rendering consumes
recognized width metadata and does not pass it through as an HTML `title`
attribute. The image URL itself remains unchanged, so URL sanitization,
attachment delivery, and exact Markdown reference detection continue to use
the stable `/b/<slug>/images/<attachment-id>` path.

Raw HTML remains disabled. External safe HTTP(S) images keep existing rendering
support, but the owner image-management modal edits only board attachment URLs
present in its library.

## 5. Editor Controller

The Markdown editor controller exposes a focused image-selection contract that
can read the selected image's source, alternative text, and normalized width.
Its image command accepts the same fields and performs one of two operations:

- with no editable board image selected, insert a new image node at the current
  selection;
- with an editable board image selected, replace that node's alternative text,
  title metadata, and presentation width in one transaction.

Both operations are single undoable editor transactions. They preserve the
existing synchronous Markdown length fence: the controller reads the resulting
Markdown immediately, rolls back an over-limit mutation, and never publishes an
oversized transient value to autosave.

In Markdown source mode, the editor detects whether the textarea selection or
caret overlaps a Markdown image node for the chosen board attachment. If so,
it replaces only that node. Otherwise it inserts a new image at the current
selection using the existing newline behavior. Failure to identify a complete
image node never causes a partial rewrite.

## 6. Image Management Modal

The toolbar image button opens one accessible image-management modal instead of
an inline panel. The modal contains:

- account usage and image limits;
- the file chooser and upload status;
- the current board image list;
- image preview, filename, and byte size;
- alternative-text input and decorative-image checkbox;
- a 25%, 50%, 75%, and 100% width control;
- insert or update action, depending on editor selection;
- a delete action for each library image.

Opening the modal while an editable board image is selected initializes the
matching library row from the document node and labels the primary action as an
update. Opening it without an editable image selected initializes normal insert
state. Selecting another library image switches back to insertion for that
image.

The modal has `role="dialog"`, an accessible name, focus containment, Escape
handling, and deterministic initial focus. Closing it restores focus to the
toolbar image button. Upload errors keep the modal open and preserve existing
library rows and relevant form state.

Alternative text is required unless the owner explicitly marks the image as
decorative. Decorative images serialize an empty alternative text. Switching
from decorative to informative restores an editable input and requires a
non-empty value before insert or update.

## 7. Delete Confirmation Modal

Deletion uses a separate accessible confirmation modal. The application never
shows two stacked dialogs: requesting deletion temporarily replaces the
management modal with the confirmation modal. Cancelling returns to the
management modal with the prior selected image and form state. Confirmed or
failed deletion returns to the management modal with an appropriate live
message; successful deletion removes the row.

The client checks the latest unsaved Markdown before opening confirmation and
again immediately before calling the server action. An image referenced by the
current draft is blocked. The existing server-side saved-Markdown reference
check remains authoritative, and all existing revision-fence behavior remains
unchanged.

The confirmation modal has `role="dialog"`, an accessible name, explicit cancel
and destructive confirm controls, focus containment, Escape-as-cancel behavior,
and focus restoration to the originating delete button when cancellation is
possible.

## 8. Rendering

Owner preview, published board rendering, and sample rendering share one width
normalization rule. Recognized metadata maps to an allowlisted CSS custom
property or class representing 25%, 50%, 75%, or 100%. Images remain block
elements, keep `max-width: 100%`, and use `height: auto`. Narrow viewports may
shrink an image below its chosen percentage only when necessary to avoid
overflow.

Missing or invalid metadata renders as 100%. Rendering never interpolates an
unvalidated title string into inline CSS.

## 9. Error Handling

- Alternative-text input values are captured synchronously before state
  updates.
- Upload failures retain the modal and do not add a library row.
- Invalid or unsupported widths are rejected at editor command boundaries and
  safely normalized when reading existing Markdown.
- Insert or update failures preserve the previous Markdown and show a Korean
  error message.
- Character-limit failures use the existing limit message and rollback path.
- In-use deletion, network failure, and server failure retain the image and
  surface the existing safe Korean messages.
- No error exposes storage paths, SQL details, tokens, or stack traces.

## 10. Testing

Test-driven implementation must cover:

- the newly uploaded image alternative-text regression;
- modal open, close, Escape, focus containment, and focus restoration;
- upload success and failure inside the modal;
- insertion at 25%, 50%, 75%, and 100%;
- editing an existing image's width and alternative text;
- decorative-image insertion and later conversion back to informative text;
- one-step undo and redo for insertion and update;
- rich/source round trips and source-mode node replacement;
- missing, malformed, and unsupported width metadata falling back to 100%;
- Markdown length rollback for both insertion and update;
- deletion confirmation, cancellation state restoration, successful deletion,
  failed deletion, and unsaved/saved reference blocking;
- owner preview and public rendering width parity;
- the live image upload, insert, reopen, resize, and delete Playwright flow.

Focused component and domain tests run before the full verification suite. The
existing image lifecycle, editor, renderer, and end-to-end tests must remain
green.

## 11. Compatibility and Migration

No database or Storage migration is required. Existing Markdown images without
width metadata continue to render at 100%. Existing title text that does not
match the exact allowlist is not treated as size metadata and is not rendered
as a tooltip by the board image renderer. Documents acquire normalized width
metadata only when an owner inserts or updates an image.
