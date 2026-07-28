# Legacy prototype behavior

The 2019 application:

1. edits Markdown in a textarea and renders a live preview;
2. accepts a URL string and renders a QR data URL;
3. exports `{ "md": string, "qr": string }` as `information.json`;
4. uploads that JSON to an Express endpoint and reloads the two fields;
5. enters a fullscreen preview.

The archived Express server is unsafe for public use because it stores the
original filename in a public directory and parses uploaded JSON without schema
or size validation. It must never be started or deployed.

The JSON download/upload behavior is retained as historical reference only. The
new application stores boards in Supabase and does not provide per-board JSON
import or export.

The archive may be removed only after the behavior inventory is retained and
automated tests cover safe Markdown preview, QR creation from a stable board
URL, and the new attachment flow.
