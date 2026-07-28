# InformationBoard Customer Service Design

Date: 2026-07-28

Status: Approved for implementation planning

## 1. Purpose

InformationBoard currently lets a user write Markdown, generate a QR code, and
download or upload a JSON file. It is a 2019 prototype built with Create React
App, React 16, Ant Design 3, and a separate Express file-upload server.

The customer-service version will let an authenticated owner create, save,
publish, update, and delete information boards. Visitors will open published
boards from a stable public URL or QR code without signing in.

The initial audience is owners and organizers creating:

- store guides;
- event information;
- meeting information.

The first release is a free public beta. It will not contain payments,
advertising, paid customer features, or commercial hosting promises.

## 2. Product Decisions

### Authentication

Owners sign in with either:

- an email magic link; or
- Google OAuth.

Visitors do not need an account to view a public or password-protected board.

### Board visibility

Each board has exactly one visibility mode:

- `public`: anyone with the URL can view it;
- `password`: visitors must enter the board password;
- `private`: only the owner can view it.

QR codes are available for public and password-protected boards only. A QR code
contains the board URL and never contains the password.

The owner separately chooses whether a public board may be indexed by search
engines. Password-protected and private boards are always non-indexable.

### Attachments

Boards support images and general file attachments.

- Maximum size per file: 10 MB.
- Maximum storage per account: 100 MB.
- Maximum attachments per board: 20.

Both browser-side checks and server-side checks enforce the limits. Server-side
checks are authoritative. Deleting a board deletes its attachments and releases
the owner's recorded storage usage.

The beta accepts JPEG, PNG, WebP, and GIF images; PDF; plain text and Markdown;
and Office Open XML documents (`.docx`, `.xlsx`, and `.pptx`). SVG, HTML,
JavaScript, archives, and executable formats are rejected. Non-image files are
download-only and are never rendered inline.

### Hosting

The beta uses:

- Vercel Hobby for the web application and a `*.vercel.app` address;
- Supabase Free for authentication, PostgreSQL, and object storage.

Vercel Hobby is used only while the service is free and non-commercial. Before
adding payments, advertising, or paid customer delivery, the service must move
to Vercel Pro or another host that permits commercial use.

Supabase Free currently includes a free project with limited database, storage,
egress, and active-user quotas. The service must monitor these quotas. The free
project may pause after low activity, and downloadable automatic backups are not
included. A backup and paid-hosting decision is therefore a release gate for a
commercial or availability-guaranteed service.

References:

- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://supabase.com/docs/guides/deployment/going-into-prod
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/limits/fair-use-guidelines

## 3. Technical Direction

Replace the legacy Create React App frontend and Express upload server with one
TypeScript Next.js application using the App Router.

The implementation will select the latest stable versions that are mutually
compatible at the time the dependency migration begins. Version selection must
be recorded in the implementation plan and lockfile, then verified with a
production build, tests, and a dependency audit.

The main system boundaries are:

1. Next.js UI components render the dashboard, editor, account screens, and
   public board.
2. Next.js Server Actions or Route Handlers validate all mutations, verify the
   authenticated user, and apply business limits.
3. Supabase Auth provides magic-link and Google sign-in.
4. Supabase PostgreSQL stores profiles, boards, attachment metadata, and access
   control data.
5. Supabase Storage stores attachment bytes.
6. PostgreSQL Row Level Security independently enforces ownership and public
   read rules.

Supabase's service-role key is server-only. It must never be included in a
browser bundle. Public URLs are constructed from an environment-configured
application origin so the hosting provider or domain can change without
changing board identifiers.

## 4. Routes and Screens

The route names may be refined during implementation, but their responsibilities
are fixed:

- `/`: product introduction and sign-in entry points;
- `/auth/callback`: Supabase OAuth and magic-link callback;
- `/dashboard`: the owner's boards, publication state, last update, and storage
  usage;
- `/boards/new`: new-board creation from the store, event, or meeting template;
- `/boards/[id]/edit`: split editor, live preview, attachments, and publication
  settings;
- `/b/[slug]`: mobile-first public or password-protected board;
- `/account`: profile and storage usage.

The editor shows form fields and Markdown input on the left and a live poster
preview on the right on desktop. On narrower screens, editing and preview use
tabs. Drafts autosave and show `saving`, `saved`, or `failed` status. Editing a
published board preserves its slug and QR address.

The initial visual direction is the approved **bold event poster** style:

- large, expressive typography;
- strong accent shapes and colors;
- clear date, time, and location hierarchy;
- mobile-first public presentation.

Owners can choose controlled theme values, but they cannot inject arbitrary CSS
or HTML. The three initial templates share the same safe component system.

## 5. Data Model

### `profiles`

- `id`: UUID matching `auth.users.id`;
- `display_name`;
- `storage_bytes`: authoritative total for ready and reserved uploads;
- created and updated timestamps.

### `boards`

- `id`: UUID;
- `owner_id`: profile UUID;
- `slug`: unique, stable public identifier;
- title, summary, and Markdown content;
- template and validated theme configuration;
- visibility: `public`, `password`, or `private`;
- lifecycle status: `draft` or `published`;
- search-indexing preference;
- created, updated, and published timestamps.

### `attachments`

- attachment, board, and owner UUIDs;
- random storage path, separate from the original filename;
- original display filename;
- verified MIME type and byte size;
- state: `reserved` or `ready`;
- created timestamp and reservation expiry.

### Server-only secrets and access control

Password hashes use Argon2id and are stored in
`private.board_secrets`, a server-only schema excluded from the Supabase Data
API. Plaintext passwords are never stored.

Failed password attempts are rate-limited using an expiring, keyed hash rather
than a raw IP address. Five failed attempts for the same board and daily
anonymous key within 15 minutes trigger a 15-minute lock. Successful
verification creates a 12-hour, HTTP-only, secure, same-site cookie scoped to
that board.

### Derived data

QR images are generated from the public URL when displayed or downloaded. They
are not stored as database rows or object-storage files.

Templates are code-defined in the first release. They are not editable database
records.

Visitor analytics and view counts are deferred. The beta does not store visitor
tracking data solely to populate dashboard metrics.

## 6. Attachment Flow

Direct-to-storage upload avoids passing a 10 MB request body through a Vercel
function.

1. The client requests an upload reservation.
2. A server transaction verifies ownership, board attachment count, file size,
   allowed MIME type, and the owner's total storage.
3. The transaction creates a short-lived `reserved` attachment and increments
   reserved usage.
4. The server returns a short-lived signed upload target for the random storage
   path.
5. The browser uploads directly to Supabase Storage.
6. The client asks the server to finalize the upload.
7. The server verifies the stored object metadata and changes the attachment to
   `ready`.
8. Failed or expired reservations and orphaned objects are removed by a cleanup
   job or an explicit recovery command.

The storage bucket also enforces a 10 MB maximum and the file-type allowlist
defined in the Attachments section. A filename extension is never trusted as the
file type.

## 7. Content and Security

- Raw HTML in Markdown is disabled.
- Rendered Markdown is sanitized with an explicit allowlist.
- Links accept safe URL protocols only. External links use safe opener
  attributes.
- All mutation inputs are validated on the server with shared schemas.
- RLS policies restrict owner mutations and implement the approved read modes.
- Private boards return a generic not-found response to non-owners.
- Password-protected responses are non-indexable and are not cached publicly.
- Attachment downloads respect the parent board's visibility.
- Private and protected attachment URLs are short-lived signed URLs.
- Security headers include an explicit Content Security Policy, frame policy,
  referrer policy, and MIME-sniffing protection.
- Secrets, tokens, board passwords, and raw email addresses are excluded from
  application logs.
- Supabase's authentication limits remain enabled. The application additionally
  limits authenticated mutations to 60 per user per minute and upload
  reservations to 20 per user per 10 minutes. Exceeding a limit returns a
  retryable `429` response.

## 8. Error Handling and Recovery

- Form validation errors identify the affected field and preserve user input.
- Each file reports its own uploading, ready, failed, or retrying state.
- Upload failure releases or expires its reservation without consuming permanent
  account quota.
- Network failure preserves a local editor recovery copy. After reconnecting,
  the owner chooses whether to restore it if it is newer than the server draft.
- Autosave uses a debounce and prevents an older response from overwriting newer
  content.
- Authentication callback failures return to a sign-in screen with a safe,
  actionable message.
- Database and storage errors shown to users do not expose internal identifiers,
  SQL, paths, or stack traces.
- Server errors include a correlation ID for diagnosis.

## 9. Legacy Compatibility

The archived prototype and its `information.json` behavior remain documented as
historical reference only. The customer-service application does not import or
export per-board JSON because Supabase is the source of truth.

The legacy Express upload server and its public upload directory are removed
after the attachment flow and data-retention checks pass their tests.

## 10. Testing and Release Gates

### Automated tests

- Unit tests cover schemas, URL rules, Markdown sanitization, visibility
  decisions, and storage limits.
- Component tests cover editor state, autosave status, attachments, publication
  settings, and error messages.
- Integration tests run against a disposable Supabase-compatible local
  environment or test project and cover RLS, reservations, finalization,
  deletion, password verification, and signed downloads.
- End-to-end tests cover sign-in, creation, autosave, publication, QR access,
  password access, update with stable slug, and deletion.

### Quality gates

Every release must pass:

- formatting and lint checks;
- TypeScript checks;
- automated tests;
- production build;
- dependency vulnerability audit;
- secret scan;
- accessibility checks for keyboard operation, labels, contrast, and responsive
  layouts.

### Beta release checklist

- Supabase Google and magic-link redirects use the deployed URL.
- RLS is enabled and tested on every exposed table.
- Storage bucket limits and MIME allowlists are active.
- Vercel and Supabase environment variables contain no development values.
- Error reporting does not contain personal data or secrets.
- A manual database export procedure is documented and tested.
- Privacy notice, terms of use, file-content policy, and deletion/contact route
  are present before inviting external users.
- Vercel Hobby remains non-commercial; any commercial launch triggers a hosting
  plan review.

## 11. Delivery Phases

The implementation plan will decompose the work into these ordered phases:

1. Baseline and safety: capture current behavior, audit dependencies, and define
   migration acceptance tests.
2. Modern foundation: replace CRA/Express with the Next.js TypeScript structure,
   CI quality gates, and environment validation.
3. Supabase foundation: schema, migrations, RLS, Auth, Storage, and local/test
   configuration.
4. Owner experience: dashboard, templates, split editor, autosave, and deletion.
5. Publishing: visibility, password access, public board, stable URL, and QR.
6. Attachments: reservations, direct upload, quotas, download authorization,
   deletion, and cleanup.
7. Visual and accessibility polish: approved poster design, responsive behavior,
   empty/error/loading states, and accessibility remediation.
8. Security and release: audits, headers, rate limits, backup procedure, policy
   pages, deployment configuration, and beta smoke test.

Each phase must leave the repository buildable and must meet its automated test
and security gates before the next phase begins.

## 12. Explicit Non-goals for the First Beta

- payments, subscriptions, or advertising;
- team workspaces or multiple editors per board;
- visitor accounts, comments, or reactions;
- custom domains;
- board revision history;
- detailed visitor analytics;
- arbitrary user-authored HTML, JavaScript, or CSS;
- availability or backup service-level guarantees.
