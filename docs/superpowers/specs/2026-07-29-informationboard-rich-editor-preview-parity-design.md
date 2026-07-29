# Rich Editor and Preview Style Parity Design

Date: 2026-07-29
Status: Approved in conversation; awaiting written-spec review

## Context

InformationBoard stores board content as Markdown. The rich editor parses that
Markdown into a Milkdown/ProseMirror document, while the owner preview and
published board render it through `BoardMarkdown` and ReactMarkdown. The
document structure is correct in both paths, but Tailwind's reset removes the
browser's default heading and list presentation. Preview-specific rules restore
the intended typography under `.board-markdown`; the rich editor currently
restores only line height and list markers. As a result, most formatted editor
content appears like plain text even though its semantic structure is present.

## Approved Behavior

The rich editing surface visually distinguishes every format available in the
current Markdown contract:

- headings use the same size, weight, spacing, and line-height hierarchy as the
  preview;
- links use the preview's accent treatment without adding the public renderer's
  external-link indicator;
- unordered and ordered lists retain their existing explicit markers and gain
  preview-compatible spacing;
- blockquotes use the same inset and accent border;
- horizontal rules use the same divider treatment;
- inline code, code blocks, and tables use the same background, spacing,
  overflow, and border treatment;
- bold, italic, and strikethrough continue to use their semantic browser
  presentation.

The editor remains an authoring surface. Its white background, minimum height,
padding, caret, selection, focus behavior, toolbar, and help footer remain
unchanged. Board-level title, summary, palette, density, and alignment styles
remain preview-only because they are outside the editable Markdown document.

## Implementation Design

Keep both renderers and the persisted Markdown contract unchanged. Add scoped
rules beneath `.markdown-rich-surface .ProseMirror` in `src/app/globals.css`
that correspond to the existing `.board-markdown` element rules. No preview
class is added to ProseMirror, and no CSS rule is made global.

The CSS is deliberately duplicated at the two renderer boundaries rather than
sharing one selector block. The editor and preview have different containers,
theme variables, and interaction requirements; explicit scoped counterparts
make those differences visible and prevent editor-only behavior from leaking
into published content. Values that represent the same visual contract remain
identical.

The rich surface defines a stable editor accent fallback using the application's
existing `--accent` variable. This allows link and blockquote treatments to
match the default preview presentation without coupling the editor to the
board's selected palette.

## Testing

Implementation is test-driven. A focused stylesheet contract test first proves
that the rich editor lacks the corresponding rules, then verifies that the
ProseMirror surface has scoped treatments for headings, links, lists,
blockquotes, dividers, code, and tables. Existing Milkdown tests continue to
verify that those formats produce and serialize semantic document structure.

Verification includes the focused regression test, existing editor and Markdown
renderer tests, and the repository verification command. A browser-level check
compares representative rich content with its owner preview when the local app
can be run with the required environment.

## Acceptance Criteria

The change is complete when a representative Markdown document containing
headings, emphasis, a link, both list types, a blockquote, a divider, code, and
a table is visibly formatted in the rich editor instead of appearing as plain
text. The owner preview retains its existing appearance, Markdown serialization
is unchanged, and editor controls and focus behavior continue to work.

## Scope

This change affects rich-editor presentation only. It does not change supported
Markdown syntax, sanitization, autosave, recovery, public rendering, theme
selection, alignment behavior, or database content.
