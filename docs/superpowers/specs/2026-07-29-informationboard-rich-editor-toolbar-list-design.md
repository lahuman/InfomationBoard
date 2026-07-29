# InformationBoard Rich Editor Toolbar and List Design

Date: 2026-07-29
Status: Approved in conversation; awaiting written-spec review

## 1. Goal

Refine the existing rich Markdown editor so formatting controls behave as true
toggles, the toolbar is easier to scan, editor guidance is visually separated
from authored content, and unordered and ordered lists remain identifiable and
correctly positioned in both left- and center-aligned previews.

This is a focused follow-up to the existing rich Markdown editor design. It
does not change the Markdown persistence contract, autosave flow, supported
Markdown syntax, or public-board security policy.

## 2. Confirmed Behavior

Selection-sensitive controls behave as toggles:

- clicking an active heading 2 or heading 3 control converts the selected
  heading back to a paragraph;
- clicking active bold or italic removes that mark;
- clicking the active link control exposes the current inline link controls,
  from which the link can be removed without deleting its text;
- clicking an active unordered list, ordered list, or blockquote control lifts
  the selected content out of that container;
- clicking an inactive control applies its existing format.

Horizontal rule, undo, and redo remain one-shot actions and do not expose a
pressed state.

## 3. Command Architecture

`MarkdownContentEditor` remains responsible for presenting controls and
forwarding commands. `createMilkdownEditorController` remains responsible for
reading ProseMirror selection state and applying document transformations.

The controller must not infer removal from Markdown string manipulation.
Instead, it uses the current document selection and ProseMirror/Milkdown
commands:

- heading removal changes the active heading block to a paragraph;
- list removal lifts selected list items out of the list;
- blockquote removal lifts the selected blocks out of the quote;
- mark commands continue using Milkdown's existing mark toggles;
- link removal continues through the existing URL form's `링크 제거` action.

Toolbar state remains the source of truth for `aria-pressed`. A command reports
`active: true` only when the current selection is inside or carries the
corresponding format. A successful apply or remove operation republishes the
toolbar state immediately.

## 4. Toolbar Presentation

The mode tabs and formatting controls remain in the editor header but gain
clear visual hierarchy:

- mode tabs occupy their own stable group;
- formatting controls are grouped as headings/emphasis, link,
  lists/blockquote, insertion, and history;
- small group gaps and separators replace the current uninterrupted row;
- controls retain Korean text labels, visible focus treatment, disabled state,
  and pressed-state contrast;
- the layout wraps by group on narrow screens without horizontal overflow.

No icon library or additional dependency is introduced. Compact Korean labels
are retained to avoid ambiguous icon-only controls and preserve the current
accessibility names.

## 5. Help Text Placement

The sentence `서식 도구 또는 Markdown 원문으로 본문을 편집할 수 있습니다.`
remains the rich textbox's accessible description. Visually, it moves out of
the authored-content area into a dedicated footer line directly beneath the
rich editor surface.

The footer has a top border, compact padding, subdued text color, and no large
empty area. This ensures the message is perceived as editor guidance rather
than board content. Source-mode labeling remains unchanged.

## 6. List Markers and Alignment

Tailwind's reset removes native list markers, so list styling must explicitly
restore them in both authoring and rendered surfaces:

- unordered lists use `disc` markers;
- ordered lists use `decimal` markers;
- nested lists retain adequate indentation;
- editor, owner preview, and public board use compatible marker and spacing
  rules.

Left-aligned themes keep normal block lists with start-aligned list text.
Center-aligned themes center the list block as a whole while preserving a
readable relationship between each marker and its item text. The list width is
content-driven up to the available container width, and list items are centered
within the board's center-aligned content area. The previous unconditional
`text-align: start` override on rendered lists is removed or narrowed so it no
longer defeats the theme alignment.

Code blocks and tables retain their existing alignment rules; this change is
limited to unordered and ordered lists.

## 7. Accessibility and Responsive Behavior

- Selection-sensitive buttons expose `aria-pressed`; action-only buttons do
  not.
- Disabled commands remain native disabled buttons.
- The toolbar's `서식 도구` accessible label remains unchanged.
- Grouping is presentational unless an accessible group name adds clear value;
  it must not create noisy repeated announcements.
- Keyboard focus returns to the editor after a command.
- At narrow widths, mode tabs and toolbar groups wrap cleanly and all controls
  remain reachable without horizontal page scrolling.
- The relocated help text remains connected with `aria-describedby`.

## 8. Error Handling and Data Integrity

Failed transformations leave the document unchanged and do not emit a false
Markdown update. Existing initialization, conversion, unsafe-link, character
limit, autosave, recovery, and conflict handling remain unchanged.

Applying and removing a format must serialize through the same canonical
Markdown value. No editor-only formatting state is persisted.

## 9. Testing

Implementation is test-driven. Focused tests cover:

- applying and then removing heading 2 and heading 3;
- applying and then removing bold and italic;
- applying and removing a link without deleting its text;
- applying and then lifting unordered lists, ordered lists, and blockquotes;
- toolbar active-state updates after each toggle;
- action-only controls remaining outside pressed-state semantics;
- explicit unordered and ordered marker styles in the rich editor and shared
  Markdown renderer;
- center-aligned owner preview and public-board list layout;
- help text remaining the editor description while rendering in a separate
  footer line;
- toolbar grouping and narrow-screen wrapping without horizontal overflow.

Verification includes focused Vitest runs, the full repository verification
command, and a browser-level visual check of rich editing plus left- and
center-aligned previews.

## 10. Acceptance Criteria

The change is complete when an author can click any active selection-sensitive
format control and remove that format without losing text. The toolbar is
visually grouped and wraps cleanly. Guidance is separated from editable board
content by a compact footer line. Unordered and ordered markers are visible in
rich editing, owner preview, and public output. Selecting center alignment also
centers list blocks and their visible marker/item presentation instead of
forcing lists back to start alignment.
