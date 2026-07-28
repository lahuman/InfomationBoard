# InformationBoard Board Owner Experience Design

**Date:** 2026-07-28  
**Phase:** 3 of the InformationBoard delivery roadmap  
**Status:** Implementation-ready

## 1. Objective

Phase 3 turns the authenticated dashboard shell into a complete private draft
workspace. A signed-in owner can create a board from a template, edit it with a
safe live preview, recover unsaved work, and delete the draft.

Publishing, public reads, password access, QR generation, and attachments remain
assigned to later phases.

Per-board JSON import and export are deliberately excluded. Supabase is the
source of truth, and backup or restore remains an operational database concern
rather than an owner-facing transfer feature.

## 2. Routes

- `/dashboard`: owner-only board list, update status, and storage usage.
- `/boards/new`: template selection and board creation.
- `/boards/[id]/edit`: owner-only editor and live preview.

All board reads and mutations use the authenticated server client so PostgreSQL
RLS remains an independent ownership boundary.

## 3. Board Model and Concurrency

The Phase 2 `public.boards` table remains the source of truth. Phase 3 adds:

- `revision bigint not null default 1`;
- a positive-value constraint;
- a trigger that increments `revision` on every update.

Draft saves include the last revision observed by the editor. The update matches
both `id` and `revision`. A zero-row update means the board was deleted or
changed since the editor loaded it; the server returns a typed conflict instead
of overwriting newer data.

Slugs are generated when a board is created even though drafts are private.
This makes the identifier stable before Phase 4 publishing. Slugs use lowercase
letters and digits and are retried on a unique collision.

## 4. Templates and Theme

Templates are code-defined, version-controlled values:

- `store`: business hours, location, and visitor guidance;
- `event`: date, time, venue, and program;
- `meeting`: purpose, agenda, preparation, and contact guidance.

Each template provides a Korean title, summary, starter Markdown, and a
validated theme. Theme values are controlled tokens rather than CSS:

- palette: `coral`, `blue`, or `lime`;
- density: `compact` or `comfortable`;
- alignment: `left` or `center`.

Unknown theme keys and values are rejected on mutation.

## 5. Dashboard and Creation

The dashboard queries the current profile and the owner's boards ordered by
`updated_at desc`. It displays:

- title, template, draft status, and last update;
- an empty state when no boards exist;
- `storage_bytes` against the 100 MB beta allowance;
- a primary action to create a board.

Board creation validates the selected template, resolves the authenticated
owner, generates a stable slug, inserts the draft, and redirects to its editor.
Validation failures preserve the submitted fields and use field-specific Korean
messages.

## 6. Editor and Autosave

Desktop uses a two-column editor and preview. Narrow layouts use accessible
`편집` and `미리보기` tabs.

Editable fields are title, summary, Markdown, and controlled theme values.
Autosave behavior:

1. Changes are debounced for 750 ms.
2. Only one save request is in flight.
3. Changes made during a request are coalesced and saved after it completes.
4. Each request includes the current `revision`.
5. A stale revision shows a conflict state and preserves the local draft.
6. Network failure keeps a recovery copy in `localStorage`.
7. A newer recovery copy is offered when the editor reopens.

The visible status is one of `저장 중`, `저장됨`, `오프라인 보관됨`, `충돌`,
or `저장 실패`. Response sequence numbers prevent older responses from
replacing newer client state.

## 7. Markdown Safety

Preview rendering never enables raw HTML. The renderer uses:

- GitHub-flavored Markdown;
- an explicit element and attribute allowlist;
- safe `http`, `https`, `mailto`, and relative links only;
- `rel="noopener noreferrer"` for external links;
- no script, iframe, style, event-handler, or arbitrary HTML support.

The server stores Markdown source, not rendered HTML.

## 8. Persistence

All owner changes are stored directly in Supabase through authenticated,
RLS-protected mutations. The application does not expose per-board JSON import
or export. Database backup and restore procedures belong to the release and
operations plan.

## 9. Deletion

Deletion requires an explicit confirmation in the editor. The server verifies
the authenticated owner and deletes through the RLS-protected client. Success
redirects to the dashboard. Missing or already-deleted boards return the same
safe outcome without exposing another owner's board.

## 10. Testing

- Migration and pgTAP tests cover revision increments and cross-owner denial.
- Unit tests cover board schemas, templates, slug generation, theme validation,
  and safe links.
- Component tests cover dashboard states, editor tabs, save statuses,
  conflict/recovery behavior, and delete confirmation.
- Route/action tests cover unauthenticated access, owner reads and mutations,
  stale revisions, and safe errors.
- E2E tests cover create, autosave, reopen, delete, and protected access.

## 11. Exit Gate

Phase 3 is complete when:

- an owner can create, autosave, reopen, and delete a draft;
- stale saves never overwrite newer content;
- a second account cannot read or mutate the draft;
- raw HTML and unsafe links cannot execute;
- offline and stale-response recovery tests pass;
- lint, typecheck, unit tests, E2E tests, build, dependency audit, and secret
  scan pass.
