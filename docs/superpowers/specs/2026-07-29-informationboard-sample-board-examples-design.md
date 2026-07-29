# InformationBoard Sample Board Examples Design

Date: 2026-07-29

Status: Approved for implementation planning

## 1. Goal

Turn the landing page's static use-case descriptions into a working product
demonstration. A visitor must be able to open complete store, event, and meeting
sample boards without signing in or depending on Supabase, and each example must
match the presentation of a real published board.

## 2. User Experience

The landing page keeps the existing `#examples` destination and the three
approved use cases. Each use-case card becomes a clear link with a visible
"샘플 보드 보기" affordance:

- 매장 안내 links to `/examples/cafe-guide`;
- 행사 안내 links to `/examples/summer-festival`;
- 모임 안내 links to `/examples/book-club`.

Each destination renders a complete, realistic Korean-language board. The
sample page identifies itself as an example rather than a live publication and
offers two next actions:

- "내 안내판 만들기" links to `/login`;
- "다른 예시 보기" links back to `/#examples`.

The sample board remains the visual focus. Its content and theme demonstrate
the same title, summary, Markdown, spacing, alignment, and controlled palette
available to a real board.

## 3. Architecture and Component Boundaries

### Static sample catalogue

A feature-local module owns the sample catalogue. Every entry has:

- a stable slug;
- a short landing-card number and description;
- a complete `PublicBoard` value suitable for the existing renderer.

The module exports the ordered list used by the landing page and a lookup
function used by the detail route. This single source prevents card URLs,
labels, and displayed boards from drifting apart.

Sample IDs and publication timestamps are deterministic. The data contains no
user records, secrets, or database identifiers copied from production.

### Landing examples

`UseCases` maps the shared catalogue into semantic linked articles. The whole
card is clickable, keyboard focus is visible, and the link text explains that
the destination is a sample board. Existing section headings and the
`#examples` anchor remain stable.

### Example route

`/examples/[slug]` is a static App Router page. It:

1. resolves `params.slug` through the sample catalogue;
2. calls `notFound()` for an unknown slug;
3. renders a lightweight sample-only navigation banner;
4. delegates the board itself to the existing public-board presentation.

The three supported slugs are returned from `generateStaticParams` so the
examples can be pre-rendered and do not require a database request.

### Shared board presentation

The board's sheet, hero, theme classes, and Markdown rendering stay in the
existing public-board view. That presentation is extracted only as far as
needed to allow the live public page and the sample page to provide different
surrounding chrome:

- the live route retains its public-board header and published footer;
- the example route shows sample navigation and never claims that the board is
  a live publication.

The extraction must preserve the existing public route's markup and behavior.

## 4. Sample Content

The catalogue uses polished content rather than editable template placeholders:

- **Cafe guide:** operating hours, location, house rules, Wi-Fi, and contact
  guidance in the lime theme;
- **Summer festival:** date, time, venue, program, transport, and rain guidance
  in the coral theme;
- **Book club:** purpose, agenda, reading preparation, venue, and participation
  guidance in the blue theme.

Content is concise enough to scan on a phone while showing headings, lists,
emphasis, and links supported by the real Markdown renderer. External links use
safe HTTPS destinations.

## 5. Responsive and Accessible Behavior

- Landing cards form a three-column layout where space allows and stack on a
  narrow viewport.
- Card links expose descriptive accessible names and retain a strong
  `:focus-visible` outline.
- Sample navigation wraps without horizontal overflow.
- The public-board presentation remains mobile-first and preserves its existing
  content width.
- The sample status is communicated with text, not color alone.
- Motion is not required for understanding or operating the examples.

## 6. Error Handling and Metadata

Unknown sample slugs use the application's normal not-found response. The route
does not fall back to a different example because that would hide broken links.

Each valid route supplies sample-specific title and description metadata. All
sample pages are non-indexable because they demonstrate the product rather than
represent a customer's published information. No runtime network error state is
needed because the catalogue is bundled with the application.

## 7. Testing and Verification

Automated coverage must prove:

- the landing page exposes all three named sample links with their expected
  paths;
- the sample catalogue resolves every known slug and rejects unknown slugs;
- a valid example route renders its sample label, board content, and both CTA
  destinations;
- the route returns not-found behavior for an unknown slug;
- the existing public-board tests continue to pass after any presentation
  extraction;
- the sample route is generated from all three stable slugs;
- lint, type checking, unit tests, production build, and the repository security
  check pass.

A browser verification at desktop and mobile widths confirms card interaction,
responsive layout, absence of horizontal overflow, and visual parity between a
sample board and the existing public-board presentation.

## 8. Out of Scope

- Loading examples from Supabase or an administration UI;
- allowing visitors to edit the sample data in place;
- cloning a sample directly into an account;
- sample analytics or view counters;
- QR generation for sample URLs;
- changing the board editor, publication model, or supported theme controls.
