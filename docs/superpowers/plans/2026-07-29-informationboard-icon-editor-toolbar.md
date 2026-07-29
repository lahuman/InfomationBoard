# InformationBoard Icon Editor Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rich Markdown editor's visible text formatting controls with a compact Lucide icon toolbar while preserving all existing behavior and accessibility semantics.

**Architecture:** `MarkdownContentEditor` remains the command and state owner; only its static toolbar metadata and button rendering change. `lucide-react` supplies decorative SVG components, while CSS owns square-button presentation, tooltips, selected states, separators, and responsive wrapping.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, `lucide-react`, Vitest, Testing Library, Playwright, CSS

## Global Constraints

- Keep all 11 existing commands and their current controller behavior unchanged.
- Keep `리치 텍스트` and `Markdown 원문` as visible text tabs.
- Use `lucide-react`; do not add a second icon package or custom SVG asset files.
- Every icon-only control must keep its Korean accessible name and matching Korean tooltip.
- Keep `aria-pressed` only on selection-sensitive commands; horizontal rule, undo, and redo remain action buttons.
- Preserve the link form, Markdown serialization, 200,000-character limit, conversion fallback, autosave, recovery, and conflict behavior.
- Toolbar groups must wrap as units without horizontal page overflow.

---

## File Structure

- Modify `package.json`: add the exact installed `lucide-react` runtime dependency.
- Modify `package-lock.json`: lock the installed icon package and transitive metadata.
- Modify `src/features/boards/editor/markdown-editor/markdown-content-editor.tsx`: map each command to a Lucide component and render accessible icon-only buttons.
- Modify `src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx`: verify icon-only markup, labels, tooltip metadata, states, grouping, and command dispatch.
- Modify `src/app/globals.css`: style the icon toolbar, tooltip, selected state, separators, and narrow-screen wrapping.
- Create `tests/e2e/editor-toolbar-layout.spec.ts`: verify computed desktop and narrow-screen toolbar layout styles.

### Task 1: Accessible Lucide Toolbar Markup

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/features/boards/editor/markdown-editor/markdown-content-editor.tsx:3-54,284-305`
- Test: `src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx:1,79-111,327-348`

**Interfaces:**
- Consumes: existing `MarkdownEditorCommand`, `ToolbarState`, `runToolbarCommand(command)`, and five-group toolbar structure.
- Produces: `toolbarGroups` items shaped as `readonly [MarkdownEditorCommand, string, LucideIcon]`; buttons exposing `aria-label`, `data-tooltip`, `aria-pressed`, and one decorative SVG.

- [ ] **Step 1: Add a failing icon-toolbar component test**

Update the Testing Library import to include `within`, then add this focused test after the pressed-state test:

```tsx
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const iconToolbarControls = [
  ["제목 2", "heading-2"],
  ["제목 3", "heading-3"],
  ["굵게", "bold"],
  ["기울임", "italic"],
  ["링크", "link"],
  ["글머리 목록", "bullet-list"],
  ["번호 목록", "ordered-list"],
  ["인용", "blockquote"],
  ["구분선", "horizontal-rule"],
  ["실행 취소", "undo"],
  ["다시 실행", "redo"],
] as const;

it("renders formatting controls as labelled Lucide icon buttons", async () => {
  const editor = createFakeController();
  render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      maxLength={200_000}
      onChange={vi.fn()}
      value="## 일정"
    />,
  );

  const toolbar = screen.getByLabelText("서식 도구");
  await screen.findByRole("button", { name: "굵게" });

  for (const [label] of iconToolbarControls) {
    const button = within(toolbar).getByRole("button", { name: label });
    expect(button).toHaveAttribute("data-tooltip", label);
    expect(button.textContent).toBe("");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  }

  expect(screen.getByRole("tab", { name: "리치 텍스트" })).toHaveTextContent(
    "리치 텍스트",
  );
  expect(screen.getByRole("tab", { name: "Markdown 원문" })).toHaveTextContent(
    "Markdown 원문",
  );
});
```

- [ ] **Step 2: Run the component test and verify the new assertion fails**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx
```

Expected: FAIL because the toolbar buttons still contain visible Korean text and no SVG or `data-tooltip` attribute.

- [ ] **Step 3: Install the single approved icon dependency**

Run:

```bash
npm install --save-exact lucide-react
```

Expected: `lucide-react` appears in `dependencies` with an exact version and `package-lock.json` is updated.

- [ ] **Step 4: Add Lucide components to the toolbar metadata**

At the top of `markdown-content-editor.tsx`, import the icons and type:

```tsx
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
```

Replace `toolbarGroups` with:

```tsx
const toolbarGroups = [
  [
    "text",
    [
      ["heading-2", "제목 2", Heading2],
      ["heading-3", "제목 3", Heading3],
      ["bold", "굵게", Bold],
      ["italic", "기울임", Italic],
    ],
  ],
  ["link", [["link", "링크", Link]]],
  [
    "blocks",
    [
      ["bullet-list", "글머리 목록", List],
      ["ordered-list", "번호 목록", ListOrdered],
      ["blockquote", "인용", Quote],
    ],
  ],
  ["insert", [["horizontal-rule", "구분선", Minus]]],
  [
    "history",
    [
      ["undo", "실행 취소", Undo2],
      ["redo", "다시 실행", Redo2],
    ],
  ],
] as const satisfies ReadonlyArray<
  readonly [
    string,
    ReadonlyArray<readonly [MarkdownEditorCommand, string, LucideIcon]>,
  ]
>;
```

- [ ] **Step 5: Render accessible icon-only buttons**

Change the inner toolbar mapping and button markup to:

```tsx
{items.map(([command, label, Icon]) => {
  const state = toolbarState[command];
  return (
    <button
      aria-label={label}
      aria-pressed={
        selectionSensitiveToolbarCommands.has(command)
          ? state.active
          : undefined
      }
      data-tooltip={label}
      disabled={!state.enabled}
      key={command}
      onClick={() => runToolbarCommand(command)}
      type="button"
    >
      <Icon aria-hidden="true" size={18} strokeWidth={2} />
    </button>
  );
})}
```

Do not change `runToolbarCommand`, link-form behavior, toolbar-state logic, or mode tabs.

- [ ] **Step 6: Add a command-dispatch regression test**

Add this test after the icon-markup test:

```tsx
it("dispatches the existing command for every non-link icon button", async () => {
  const editor = createFakeController();
  render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      maxLength={200_000}
      onChange={vi.fn()}
      value="본문"
    />,
  );

  await screen.findByRole("button", { name: "굵게" });
  for (const [label, command] of iconToolbarControls) {
    if (command === "link") continue;
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(editor.run).toHaveBeenLastCalledWith(command);
  }
});
```

The existing inactive-link and active-link tests continue to cover the link form and removal command.

- [ ] **Step 7: Run focused component tests**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx
```

Expected: all tests in the file PASS, including existing pressed/disabled and link behavior tests.

- [ ] **Step 8: Check types and formatting**

Run:

```bash
npm run typecheck
npx eslint src/features/boards/editor/markdown-editor/markdown-content-editor.tsx src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 9: Commit the accessible icon markup**

```bash
git add package.json package-lock.json src/features/boards/editor/markdown-editor/markdown-content-editor.tsx src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx
git commit -m "feat: render editor toolbar icons"
```

### Task 2: Conventional Toolbar Styling and Responsive Layout

**Files:**
- Modify: `src/app/globals.css:31-93,256-261,1946-2070`
- Create: `tests/e2e/editor-toolbar-layout.spec.ts`

**Interfaces:**
- Consumes: `.markdown-editor-header`, `.markdown-mode-tabs`, `.markdown-toolbar`, `.markdown-toolbar-group`, icon buttons with `data-tooltip`, and `aria-pressed` from Task 1.
- Produces: 36-pixel icon controls, coral selected treatment, CSS hover/focus tooltips, group separators, and unit-wrapping responsive layout.

- [ ] **Step 1: Add a failing Playwright layout test**

Create `tests/e2e/editor-toolbar-layout.spec.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const toolbarMarkup = `
  <div class="markdown-editor-header">
    <div class="markdown-mode-tabs">
      <button aria-selected="true">리치 텍스트</button>
      <button aria-selected="false">Markdown 원문</button>
    </div>
    <div class="markdown-toolbar" aria-label="서식 도구">
      <div class="markdown-toolbar-group">
        <button aria-label="제목 2" data-tooltip="제목 2"><svg></svg></button>
        <button aria-label="굵게" aria-pressed="true" data-tooltip="굵게"><svg></svg></button>
      </div>
      <div class="markdown-toolbar-group">
        <button aria-label="실행 취소" data-tooltip="실행 취소"><svg></svg></button>
        <button aria-label="다시 실행" data-tooltip="다시 실행" disabled><svg></svg></button>
      </div>
    </div>
  </div>
`;

async function mountToolbar(page: Page) {
  await page.setContent(toolbarMarkup);
  await page.addStyleTag({
    content: await readFile(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    ),
  });
}

test("styles formatting actions as compact icon controls", async ({ page }) => {
  await mountToolbar(page);
  const bold = page.getByRole("button", { name: "굵게" });

  await expect(bold).toHaveCSS("width", "36px");
  await expect(bold).toHaveCSS("height", "36px");
  await expect(bold).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".markdown-toolbar-group").first()).toHaveCSS(
    "border-right-width",
    "1px",
  );

  await bold.focus();
  const tooltipContent = await bold.evaluate((element) =>
    getComputedStyle(element, "::after").content,
  );
  expect(tooltipContent).toBe("\"굵게\"");
});

test("wraps toolbar groups without horizontal page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await mountToolbar(page);

  await expect(page.locator(".markdown-editor-header")).toHaveCSS(
    "flex-wrap",
    "wrap",
  );
  await expect(page.locator(".markdown-toolbar")).toHaveCSS("flex-wrap", "wrap");
  await expect(page.locator(".markdown-toolbar-group").first()).toHaveCSS(
    "flex-wrap",
    "nowrap",
  );

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
```

- [ ] **Step 2: Run the new Playwright test and verify it fails**

Run:

```bash
npm run test:e2e -- tests/e2e/editor-toolbar-layout.spec.ts
```

Expected: FAIL because formatting buttons are text-sized rectangles, the header does not wrap, and no tooltip pseudo-element exists.

- [ ] **Step 3: Separate mode-tab and icon-button base styles**

In `src/app/globals.css`, keep the shared font and cursor rules minimal, then use these explicit controls:

```css
.markdown-editor-header {
  flex-wrap: wrap;
  justify-content: space-between;
  padding: 0.65rem 0.75rem;
  border-bottom: 1px solid var(--foreground);
  background: var(--background);
}

.markdown-mode-tabs,
.markdown-toolbar {
  flex-wrap: wrap;
}

.markdown-toolbar {
  justify-content: flex-end;
  gap: 0.55rem;
}

.markdown-toolbar-group {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.15rem;
  padding-inline-end: 0.55rem;
  border-inline-end: 1px solid var(--line);
}

.markdown-toolbar-group:last-child {
  padding-inline-end: 0;
  border-inline-end: 0;
}

.markdown-mode-tabs button,
.markdown-link-form button {
  min-height: 2.35rem;
  border: 1px solid var(--foreground);
  border-radius: 0;
  background: #fffdf7;
  color: var(--foreground);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.markdown-toolbar button {
  position: relative;
  display: inline-grid;
  width: 2.25rem;
  min-width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 0.3rem;
  background: transparent;
  color: var(--foreground);
  cursor: pointer;
}

.markdown-mode-tabs button[aria-selected="true"] {
  background: var(--foreground);
  color: var(--background);
}

.markdown-toolbar button:hover:not(:disabled) {
  border-color: var(--line);
  background: color-mix(in srgb, var(--foreground) 7%, transparent);
}

.markdown-toolbar button[aria-pressed="true"] {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--foreground));
  background: color-mix(in srgb, var(--accent) 20%, #fffdf7);
  color: color-mix(in srgb, var(--accent) 55%, var(--foreground));
}

.markdown-mode-tabs button:disabled,
.markdown-toolbar button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
```

Remove the old combined rule that gives `.markdown-toolbar button` the same rectangular border and text styling as mode tabs.

- [ ] **Step 4: Add stable hover and keyboard-focus tooltips**

Add:

```css
.markdown-toolbar button::after {
  position: absolute;
  z-index: 10;
  top: calc(100% + 0.4rem);
  left: 50%;
  width: max-content;
  max-width: 10rem;
  padding: 0.35rem 0.5rem;
  transform: translateX(-50%) translateY(-0.2rem);
  border-radius: 0.25rem;
  background: var(--foreground);
  color: #fffdf7;
  content: attr(data-tooltip);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.2;
  opacity: 0;
  pointer-events: none;
  white-space: nowrap;
}

.markdown-toolbar button:hover:not(:disabled)::after,
.markdown-toolbar button:focus-visible::after {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}

.markdown-toolbar-group:first-child button:first-child::after {
  left: 0;
  transform: translateY(-0.2rem);
}

.markdown-toolbar-group:first-child button:first-child:hover::after,
.markdown-toolbar-group:first-child button:first-child:focus-visible::after {
  transform: translateY(0);
}

.markdown-toolbar-group:last-child button:last-child::after {
  right: 0;
  left: auto;
  transform: translateY(-0.2rem);
}

.markdown-toolbar-group:last-child button:last-child:hover::after,
.markdown-toolbar-group:last-child button:last-child:focus-visible::after {
  transform: translateY(0);
}
```

Tooltips must remain layout-neutral and must not replace the existing three-pixel focus outline.

- [ ] **Step 5: Add narrow-screen alignment rules**

Inside the existing `@media (max-width: 42rem)` block, add:

```css
.markdown-editor-header {
  align-items: flex-start;
  flex-direction: column;
}

.markdown-toolbar {
  justify-content: flex-start;
  width: 100%;
}
```

The base `.markdown-editor-header { flex-wrap: wrap; }`, `.markdown-toolbar { flex-wrap: wrap; }`, and `.markdown-toolbar-group { flex-wrap: nowrap; }` rules remain active at all widths.

- [ ] **Step 6: Run the focused layout and component tests**

Run:

```bash
npm run test:e2e -- tests/e2e/editor-toolbar-layout.spec.ts
npm run test:run -- src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx
```

Expected: both commands exit 0.

- [ ] **Step 7: Visually inspect desktop and narrow layouts in the signed-in editor**

Start the app:

```bash
npm run dev
```

Use the in-app browser to open a board edit screen at a desktop viewport and a 360-pixel viewport. Confirm:

- the mode tabs remain readable text;
- all 11 formatting actions use consistent Lucide icons;
- each tooltip appears on pointer hover and keyboard focus without clipping;
- pressed, hover, focus, and disabled states are visually distinct;
- separators create five readable groups;
- the link form still opens below the toolbar;
- no horizontal scrolling appears at 360 pixels.

Stop the development server after inspection.

- [ ] **Step 8: Run repository-wide verification**

Run:

```bash
npm run verify
```

Expected: lint, TypeScript, unit tests, production build, and client-secret checks all exit 0.

- [ ] **Step 9: Review the final diff**

Run:

```bash
git diff --check
git status --short
git diff -- package.json package-lock.json src/features/boards/editor/markdown-editor/markdown-content-editor.tsx src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx src/app/globals.css tests/e2e/editor-toolbar-layout.spec.ts
```

Expected: only the approved dependency, toolbar markup/tests, toolbar styles, and layout test are present; no command logic or persistence code changed.

- [ ] **Step 10: Commit the toolbar styling and layout coverage**

```bash
git add src/app/globals.css tests/e2e/editor-toolbar-layout.spec.ts
git commit -m "style: refine editor icon toolbar"
```
