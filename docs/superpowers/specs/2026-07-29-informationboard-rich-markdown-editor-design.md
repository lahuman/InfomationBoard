# InformationBoard Rich Markdown Editor Design

Date: 2026-07-29
Status: Approved in conversation; awaiting written-spec review

## 1. Goal

Improve board authoring and published Markdown presentation without changing the
storage contract. Board content remains Markdown, while authors receive a rich
text editor with an explicit Markdown source mode. The public board preserves
intentional summary line breaks and presents headings, lists, links, and
horizontal rules with a clearer document hierarchy.

The agreed visual direction is a restrained document style. It keeps the
existing InformationBoard appearance and improves typography and spacing rather
than placing sections in cards.

## 2. Scope

This change includes:

- a Milkdown Kit-based rich text editor for board Markdown;
- a `Rich text / Markdown source` mode switch;
- a visible formatting toolbar above the content editor;
- Markdown round-tripping through the existing draft and autosave flow;
- intentional summary line-break preservation in editor preview and public
  boards;
- improved public and preview styling for headings, lists, links, paragraphs,
  and horizontal rules;
- tests for editing, synchronization, rendering, safety, accessibility, and
  responsive behavior.

This change does not add collaborative editing, media uploads, arbitrary HTML,
custom CSS, slash commands, floating menus, or a new persistence format.

## 3. Technical Direction

Use Milkdown Kit rather than the prebuilt Crepe editor. Milkdown is a
Markdown-centered ProseMirror editor with React integration and Markdown change
listeners. The Kit approach allows InformationBoard to expose only the agreed
commands and to match the existing visual system without inheriting an
opinionated editor shell.

Tiptap was considered but not selected because its bidirectional Markdown
extension is currently documented as beta. A custom `contenteditable`
implementation was rejected because selection handling, undo history,
accessibility, Markdown conversion, and paste behavior would create unnecessary
risk.

References:

- https://milkdown.dev/docs/recipes/react
- https://milkdown.dev/docs/guide/getting-started
- https://tiptap.dev/docs/editor/markdown

## 4. Component Boundaries

`BoardEditor` remains the owner of the `EditorDraft`, revision, recovery,
conflict, and autosave state. Its current Markdown textarea is replaced by a
focused `MarkdownContentEditor` client component.

`MarkdownContentEditor` accepts a Markdown `value`, an `onChange(markdown)`
callback, and accessible labeling. It owns only presentation-specific state:
the active editing mode, the Milkdown instance, selection-dependent toolbar
state, and initialization or conversion errors.

The component is divided into independently testable units:

- editor configuration: Milkdown presets and plugins for the supported syntax;
- toolbar: command buttons and active-state reporting;
- rich editor surface: Markdown parsing, editing, and serialization;
- source editor surface: direct Markdown textarea editing;
- synchronization adapter: reconciles external values without feedback loops.

`BoardMarkdown` remains the shared safe renderer for preview and public views.
It keeps its explicit allowlist, raw HTML rejection, URL sanitization, and
external-link isolation.

## 5. Data Flow and Synchronization

Markdown remains the single canonical content value.

1. `BoardEditor` passes `draft.contentMarkdown` to
   `MarkdownContentEditor`.
2. A rich-editor transaction serializes the document to Markdown and calls
   `onChange` only when the string differs from the current canonical value.
3. Source-mode input calls the same `onChange` callback.
4. `BoardEditor.updateDraft` feeds the existing 750 ms autosave, recovery-copy,
   and revision flow without a second saving mechanism.
5. When the source mode returns to rich mode, the latest Markdown is parsed
   before the visual surface becomes active.
6. External changes caused by recovery restore, server-conflict selection, or a
   new board value update the editor only when they differ from the editor's
   last emitted Markdown. Programmatic updates do not re-emit an identical
   value.

Mode switching flushes the active editor value before changing surfaces. The
implementation must not keep two independently editable document models.

## 6. Rich Editor and Toolbar Behavior

The toolbar appears immediately above the rich editor and provides:

- heading level 2;
- heading level 3;
- bold;
- italic;
- link;
- unordered list;
- ordered list;
- blockquote;
- horizontal rule;
- undo;
- redo.

Buttons have visible Korean labels or an unambiguous symbol paired with an
accessible Korean name. Commands with an active selection state expose it with
`aria-pressed`. Disabled commands expose `disabled`. Native keyboard shortcuts
provided by the editor remain available.

The link command applies a URL to the selection after it passes the existing
board URL policy. Unsafe schemes such as `javascript:` are rejected. Removing a
link remains possible from the same control. External-link target behavior is a
rendering concern and remains in `BoardMarkdown`.

The mode control sits in the editor header and exposes `Rich text` and
`Markdown source` as accessible tabs. Source mode uses a labeled monospace
textarea and retains the current 200,000-character limit.

## 7. Markdown Support and Rendering

The rich editor supports paragraphs, headings, bold, italic, links, unordered
and ordered lists, blockquotes, and horizontal rules. The Milkdown GFM plugin
also preserves the existing renderer's strikethrough and table syntax during
rich/source round trips, although the first toolbar does not add dedicated
strikethrough or table controls.

Markdown source mode is always available for content that is easier to express
or repair directly. A mode switch must never silently discard Markdown outside
the supported rich-editor subset. If a source document cannot be parsed without
loss, the component preserves the original Markdown, stays in source mode, and
reports the problem.

Public and preview Markdown styling follows the approved restrained document
direction:

- `h2` and `h3` receive distinct sizes, weights, and vertical spacing;
- headings never receive automatic divider lines;
- a divider appears only for an authored Markdown horizontal rule (`---`),
  including when inserted with the toolbar;
- unordered and ordered list markers are visible;
- list indentation and spacing make item structure clear;
- paragraphs, lists, headings, and horizontal rules use a consistent vertical
  rhythm;
- the first content element does not add unnecessary top whitespace;
- links have clear underline treatment and external links include a visual
  external indicator while retaining their accessible link text;
- center-aligned board themes keep prose blocks and list contents readable.

The external indicator is rendered decoratively so it does not pollute copied
text or the accessible name.

## 8. Summary Line Breaks

Summary authoring remains a plain textarea. Newline characters already fit the
existing string schema and database field, so no persistence migration is
required.

Both `.preview-summary` and `.public-board-summary` use `white-space: pre-wrap`.
This preserves user-entered newlines and repeated spaces while allowing normal
line wrapping within the available width. Preview and public output must render
the same line-break structure.

## 9. Failure Handling

If Milkdown fails to initialize, the editor exposes a short status message and
falls back to Markdown source mode with the original value intact.

If rich/source conversion fails, the component:

1. retains the last canonical Markdown;
2. stays in or returns to source mode;
3. shows an actionable message;
4. does not emit an empty or partially converted replacement.

The existing autosave failure, offline recovery, and revision-conflict behavior
continues unchanged because all successful edits still pass through
`BoardEditor.updateDraft`.

## 10. Accessibility and Responsive Layout

The editor surface has a programmatic label and help text. The toolbar and mode
tabs are keyboard reachable in document order. Focus remains visible under the
existing focus treatment. Status and error messages use appropriate live-region
semantics without duplicating the global save status.

On narrow screens, toolbar controls wrap to additional rows without horizontal
page scrolling. Existing `Edit / Preview` responsive tabs continue to control
the main panels. The rich editor must remain usable at the smallest supported
viewport.

## 11. Testing and Verification

Unit and component tests cover:

- loading the existing sample Markdown into rich mode;
- serializing rich edits back to Markdown;
- rich-to-source-to-rich round trips for headings, emphasis, links, lists,
  blockquotes, and horizontal rules;
- toolbar commands, active states, undo, and redo;
- unsafe-link rejection;
- preservation of Markdown when conversion or initialization fails;
- synchronization after recovery restore and conflict resolution without an
  update loop;
- autosave receiving the serialized Markdown value;
- summary newline preservation in preview and public output;
- heading hierarchy without automatic borders;
- authored horizontal-rule rendering;
- visible list markers, ordered numbering, and external-link treatment;
- current raw HTML and unsafe URL security guarantees;
- keyboard labels, pressed/disabled states, and source-tab semantics;
- toolbar wrapping and existing editor/preview behavior at narrow layouts.

Completion requires passing lint, TypeScript checking, the unit test suite, a
production build, and the repository's existing verification command. New
behavior is implemented test-first.

## 12. Acceptance Criteria

The work is complete when an owner can visually edit the sample content, switch
to Markdown source and back without content loss, use the agreed toolbar, and
receive the same Markdown through the existing autosave path. Intentional
summary newlines appear identically in preview and on the published board.

Published headings use size and spacing only; they never create implicit
dividers. Lists visibly retain bullets or numbering, safe links are visually
clear, authored horizontal rules render as dividers, and existing HTML and URL
safety tests continue to pass.
