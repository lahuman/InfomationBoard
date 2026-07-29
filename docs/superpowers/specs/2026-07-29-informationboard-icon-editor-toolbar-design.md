# InformationBoard Icon Editor Toolbar Design

Date: 2026-07-29
Status: Approved in conversation; awaiting written-spec review

## 1. Goal

Replace the rich Markdown editor's text-heavy formatting controls with a
compact, familiar icon toolbar. The editor should resemble a conventional
document editor while preserving every existing command, Markdown behavior,
and accessibility contract.

This is a presentation-focused refinement. It does not add formatting
features, change Markdown persistence, alter autosave behavior, or modify the
public board renderer.

## 2. Confirmed Direction

Use `lucide-react` for a coherent icon set rather than maintaining custom SVG
paths or relying on font-dependent Unicode symbols.

The toolbar retains its current commands:

- heading level 2 and heading level 3;
- bold and italic;
- link;
- unordered and ordered lists;
- blockquote;
- horizontal rule;
- undo and redo.

The `리치 텍스트` and `Markdown 원문` mode controls remain visible text tabs.
They are navigation controls rather than formatting actions and should not be
reduced to ambiguous icons.

## 3. Component Design

`MarkdownContentEditor` continues to own toolbar rendering and command
dispatch. Its command controller, toolbar state, link form, conversion error
handling, and source-mode synchronization remain unchanged.

Each toolbar definition adds an icon component and retains its Korean label.
The label is used for the button's accessible name and tooltip, but it is no
longer rendered as visible button text. Icons are decorative and hidden from
the accessibility tree so assistive technology announces a single Korean
name.

The toolbar keeps the current functional groups:

1. headings and emphasis;
2. link;
3. lists and blockquote;
4. horizontal rule insertion;
5. history.

Group boundaries remain visible as subtle vertical separators. No new toolbar
abstraction is required unless extracting a small icon-button component makes
the accessible markup materially clearer.

## 4. Visual Behavior

Formatting controls become compact square buttons, approximately 36 pixels on
each side, with centered Lucide icons and consistent stroke weight. The
toolbar uses a light editor surface, restrained borders, and small gaps that
match the existing InformationBoard visual language.

Selection-sensitive controls use the existing `aria-pressed` state and gain a
coral-tinted selected background with sufficient foreground contrast. Disabled
history controls remain visibly subdued. Hover and focus states are distinct
from the selected state.

A Korean tooltip appears when a user hovers a button or focuses it with the
keyboard. Tooltip content matches the accessible name exactly. Tooltips do not
capture pointer events and do not shift the toolbar layout.

The current link URL form opens beneath the toolbar and is not redesigned by
this change.

## 5. Accessibility and Responsive Layout

- Every icon-only button has a Korean `aria-label`.
- Selection-sensitive commands retain `aria-pressed`; horizontal rule, undo,
  and redo remain action buttons without pressed-state semantics.
- Each Lucide SVG is decorative with respect to the button's accessible name.
- Tooltips are available on both hover and `:focus-visible`.
- Existing focus outlines remain clearly visible and are not obscured by the
  tooltip.
- Native `disabled` semantics remain unchanged.
- Toolbar groups wrap as units on narrow screens so buttons remain reachable
  without horizontal page scrolling.
- The mode tabs remain text labels and may occupy their own row when space is
  constrained.

## 6. Data Flow and Failure Handling

Button clicks continue to call the existing `runToolbarCommand` flow. Active
link removal, link-form display, controller focus restoration, Markdown
serialization, the character limit, conversion fallback, autosave, recovery,
and conflict handling do not change.

Loading the icon package does not introduce a runtime data dependency. If a
format command is disabled or cannot run, existing controller behavior remains
the source of truth and the document is not modified.

## 7. Testing

Implementation is test-driven. Focused component tests verify:

- every formatting command renders as an icon-only button with the expected
  Korean accessible name;
- visible text labels are absent from the buttons;
- tooltip text is associated with each icon button's label;
- active and disabled states retain their current accessibility semantics;
- clicking each button still dispatches the same controller command;
- mode tabs remain visible text controls;
- toolbar groups and separators remain represented in the markup for
  responsive styling.

Verification includes the focused Markdown editor tests, the full repository
verification command, and a browser-level visual check at desktop and narrow
viewport widths.

## 8. Acceptance Criteria

The change is complete when the rich editor presents its formatting actions as
a cohesive Lucide icon toolbar, while mode tabs remain readable text. Every
icon button is understandable through a Korean tooltip and accessible name,
selected and disabled states remain clear, existing formatting behavior is
unchanged, and the toolbar wraps without horizontal page overflow.
