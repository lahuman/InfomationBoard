# InformationBoard Delivery Roadmap

Design source:
`docs/superpowers/specs/2026-07-28-informationboard-customer-service-design.md`

The redesign is intentionally split into independently reviewable plans. Each
phase must leave the repository buildable, tested, and safe to continue.

## Phase 1: Modern foundation

Detailed plan:
`docs/superpowers/plans/2026-07-28-informationboard-modern-foundation.md`

Deliver:

- archive the 2019 CRA and Express source without losing migration fixtures;
- establish Next.js 16, React 19, TypeScript, Tailwind CSS, ESLint, Vitest, and
  Playwright;
- add environment validation, security headers, CI quality gates, and the
  approved bold-poster landing shell;
- record the old `information.json` behavior as historical reference.

Exit gate:

- lint, type checking, unit/component tests, E2E smoke test, production build,
  and dependency audit pass;
- the application runs on Node.js 20.9 or newer;
- no legacy server is started or exposed.

## Phase 2: Supabase foundation and authentication

Create a separate implementation plan after Phase 1 passes.

Deliver:

- Supabase CLI configuration and versioned SQL migrations;
- `profiles`, `boards`, `attachments`, `private.board_secrets`, and
  `private.access_attempts`;
- RLS policies and policy tests;
- server, browser, and service-role Supabase clients with strict key boundaries;
- email magic-link and Google OAuth sign-in, callback, sign-out, and protected
  dashboard shell.

Exit gate:

- local/test migrations apply from an empty database;
- RLS tests prove cross-user writes and private reads fail;
- authentication callback and protected-route tests pass;
- service-role credentials cannot appear in client output.

## Phase 3: Board owner experience

Create a separate implementation plan after Phase 2 passes.

Deliver:

- store, event, and meeting templates;
- dashboard board list and storage meter;
- board creation, draft update, autosave conflict protection, and deletion;
- desktop split editor and mobile edit/preview tabs;
- safe Markdown rendering.

Exit gate:

- a signed-in owner can create, autosave, reopen, and delete a draft;
- a second account cannot read or mutate the draft;
- raw HTML and unsafe links cannot execute;
- recovery-copy tests cover offline and stale-response behavior.

## Phase 4: Publishing, password access, and QR

Create a separate implementation plan after Phase 3 passes.

Deliver:

- draft and published lifecycle;
- stable unique slugs;
- public, password-protected, and private visibility;
- Argon2id password hashing in the private schema;
- five-attempt lockout and a 12-hour board-scoped access cookie;
- mobile public board, metadata and indexing rules;
- QR preview and PNG/SVG download generated from the configured application
  origin.

Exit gate:

- changing a published board preserves its URL;
- private boards return a generic not-found response to non-owners;
- protected boards are non-indexable and uncached publicly;
- password and QR E2E scenarios pass.

## Phase 5: Attachments and quotas

Create a separate implementation plan after Phase 4 passes.

Deliver:

- 10 MB per-file, 100 MB per-account, and 20-files-per-board enforcement;
- explicit MIME allowlist from the design;
- transactional upload reservation;
- direct signed upload to Supabase Storage;
- finalization, authorized download, deletion, expiry, and orphan cleanup;
- per-file retry and accessible upload states.

Exit gate:

- concurrent reservations cannot exceed account quota;
- rejected file types and oversized files never become ready attachments;
- deleting a board removes its objects and releases quota;
- protected/private downloads require the same authorization as their board.

## Phase 6: Visual design and accessibility

Create a separate implementation plan after Phase 5 passes.

Deliver:

- approved bold event-poster visual system;
- controlled theme values without arbitrary CSS;
- polished store, event, and meeting public templates;
- complete empty, loading, error, and retry states;
- keyboard, focus, label, contrast, reduced-motion, and responsive fixes.

Exit gate:

- automated accessibility checks have no serious or critical findings;
- keyboard-only creation and publication works;
- public boards pass mobile visual regression checks at 320, 390, 768, and
  1440 CSS pixels.

## Phase 7: Security, policy, and free-beta release

Create a separate implementation plan after Phase 6 passes.

Deliver:

- application rate limits and abuse responses;
- secret scan, dependency audit, and security-header verification;
- privacy notice, terms, file-content policy, deletion/contact instructions;
- Supabase export and restore rehearsal documentation;
- Vercel Hobby and Supabase Free deployment configuration;
- Google and magic-link production redirect configuration;
- production smoke test and rollback procedure.

Exit gate:

- the complete quality gate passes from a clean checkout;
- deployed RLS and storage policies match source-controlled migrations;
- no secrets or development URLs are present in built output;
- the beta contains no payments, advertisements, or paid customer delivery;
- the final checklist records when Vercel Pro or an alternative commercial host
  becomes mandatory.
