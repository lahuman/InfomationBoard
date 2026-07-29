# InformationBoard Rich Editor Toolbar and List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make rich-editor formats removable by the same active controls, improve toolbar/help-text hierarchy, and restore visible, correctly centered list markers in editor, preview, and public output.

**Architecture:** Keep `MarkdownContentEditor` as the accessible UI boundary and `createMilkdownEditorController` as the ProseMirror command boundary. Use real Milkdown/ProseMirror transformations for format removal and narrowly scoped markup/CSS changes for toolbar grouping, help placement, list markers, and center alignment; Markdown remains the only persisted content value.

**Tech Stack:** Next.js 16.2.12, React 19.2.8, TypeScript 6.0.3, Milkdown Kit 7.21.3, Vitest 4.1.10, Testing Library 16.3.2, Playwright 1.62.0, CSS.

## Global Constraints

- Do not change the Markdown persistence contract, `BoardEditor` autosave flow, supported Markdown syntax, or public-board sanitization.
- Active heading 2/3, bold, italic, link, unordered-list, ordered-list, and blockquote controls remove their own format without deleting text.
- Horizontal rule, undo, and redo remain one-shot actions without `aria-pressed`.
- Inactive link opens the URL form; active link immediately removes the link, while the form's existing `링크 제거` action remains available.
- Do not manipulate Markdown strings to remove block formatting; use Milkdown/ProseMirror document commands.
- Do not add an icon library or another runtime dependency.
- Keep Korean control labels, visible focus, native disabled states, and the existing `서식 도구` accessible toolbar label.
- Keep the help sentence connected to the rich textbox through `aria-describedby` while presenting it in a separate footer line.
- Restore `disc` for unordered lists and `decimal` for ordered lists in rich editing and shared rendered Markdown.
- Center-aligned themes center the list block and its visible marker/item presentation; code-block and table alignment remain unchanged.
- Implement each behavior test-first and observe the expected failure before production changes.

---

## File Structure

- `src/features/boards/editor/markdown-editor/milkdown-editor.test.ts`: real-controller tests for applying and removing block/inline formats and publishing toolbar state.
- `src/features/boards/editor/markdown-editor/milkdown-editor.ts`: selection-aware toggle command implementation using Milkdown commands and ProseMirror `lift`.
- `src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx`: component behavior for active-link removal, toolbar groups, and separated accessible help.
- `src/features/boards/editor/markdown-editor/markdown-content-editor.tsx`: grouped toolbar markup, link toggle routing, and help footer markup.
- `src/features/boards/markdown/board-markdown.test.tsx`: renderer contract for distinguishable unordered and ordered list hooks.
- `src/features/boards/markdown/board-markdown.tsx`: explicit `board-markdown-list-unordered` and `board-markdown-list-ordered` classes on rendered lists.
- `src/app/globals.css`: grouped toolbar/footer styling, explicit rich/rendered list markers, and center-aligned list layout.
- `tests/e2e/board-owner.spec.ts`: browser assertions for marker type, center alignment, toolbar containment, and help footer placement.

---

### Task 1: Real Rich-Editor Format Toggles

**Files:**
- Modify: `src/features/boards/editor/markdown-editor/milkdown-editor.test.ts`
- Modify: `src/features/boards/editor/markdown-editor/milkdown-editor.ts`

**Interfaces:**
- Consumes: `MarkdownEditorController.run(command, payload?)`, `getToolbarState()`, and the existing `__testing.selectText(controller, from, to)` test utility.
- Produces: selection-aware toggle behavior for the existing `MarkdownEditorCommand` union without changing its type.

- [ ] **Step 1: Write failing tests for heading and inline toggles**

Add real-controller tests whose production mutations are “always apply heading” and “fail to remove an active mark”:

```ts
it.each([
  ["heading-2", "## 선택할 문장"],
  ["heading-3", "### 선택할 문장"],
] as const)("toggles %s back to a paragraph", async (command, formatted) => {
  const { controller, root } = await setup("선택할 문장");
  __testing.selectText(controller, 1, 7);

  expect(controller.run(command)).toBe(true);
  expect(controller.getMarkdown()).toBe(formatted);
  expect(controller.getToolbarState()[command].active).toBe(true);

  expect(controller.run(command)).toBe(true);
  expect(controller.getMarkdown()).toBe("선택할 문장");
  expect(root.querySelector("p")).toHaveTextContent("선택할 문장");
  expect(controller.getToolbarState()[command].active).toBe(false);
});

it.each([
  ["bold", "**선택할 문장**"],
  ["italic", "*선택할 문장*"],
] as const)("toggles %s off without deleting text", async (command, formatted) => {
  const { controller } = await setup("선택할 문장");
  __testing.selectText(controller, 1, 7);

  expect(controller.run(command)).toBe(true);
  expect(controller.getMarkdown()).toBe(formatted);
  expect(controller.run(command)).toBe(true);
  expect(controller.getMarkdown()).toBe("선택할 문장");
});
```

- [ ] **Step 2: Run the focused tests and confirm the heading cases fail for the expected reason**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/milkdown-editor.test.ts
```

Expected: the second heading command leaves `##` or `###`; existing bold/italic toggle cases pass and characterize retained behavior.

- [ ] **Step 3: Implement heading removal through `turnIntoTextCommand`**

Import `turnIntoTextCommand` from `@milkdown/kit/preset/commonmark`. In `run`, capture `const activeState = getToolbarState()` before building actions and map headings as follows:

```ts
"heading-2": () =>
  activeState["heading-2"].active
    ? editor.action(callCommand(turnIntoTextCommand.key))
    : editor.action(callCommand(wrapInHeadingCommand.key, 2)),
"heading-3": () =>
  activeState["heading-3"].active
    ? editor.action(callCommand(turnIntoTextCommand.key))
    : editor.action(callCommand(wrapInHeadingCommand.key, 3)),
```

Leave `toggleStrongCommand` and `toggleEmphasisCommand` unchanged because they already provide apply/remove behavior.

- [ ] **Step 4: Run the focused tests and confirm heading/inline toggles pass**

Run the Task 1 focused Vitest command. Expected: PASS.

- [ ] **Step 5: Write failing tests for lists and blockquotes**

Add one literal round-trip test per block wrapper:

```ts
it.each([
  ["bullet-list", "- 선택할 문장", "ul"],
  ["ordered-list", "1. 선택할 문장", "ol"],
  ["blockquote", "> 선택할 문장", "blockquote"],
] as const)("toggles %s off without deleting text", async (command, formatted, selector) => {
  const { controller, root } = await setup("선택할 문장");
  __testing.selectText(controller, 1, 7);

  expect(controller.run(command)).toBe(true);
  expect(controller.getMarkdown()).toBe(formatted);
  expect(controller.getToolbarState()[command].active).toBe(true);

  expect(controller.run(command)).toBe(true);
  expect(controller.getMarkdown()).toBe("선택할 문장");
  expect(root.querySelector(selector)).not.toBeInTheDocument();
  expect(controller.getToolbarState()[command].active).toBe(false);
});
```

- [ ] **Step 6: Run the focused tests and verify removal fails**

Run the Task 1 focused Vitest command. Expected: the second list/blockquote commands return `false` or leave their wrapper in the document.

- [ ] **Step 7: Implement list-item and blockquote lifting**

Import `lift` from `@milkdown/kit/prose/commands` and `liftListItemCommand` from the commonmark preset. Add this local adapter:

```ts
function runProseCommand(editor: Editor, command: typeof lift): boolean {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    return command(view.state, view.dispatch, view);
  });
}
```

Then use the captured `activeState`:

```ts
"bullet-list": () =>
  activeState["bullet-list"].active
    ? editor.action(callCommand(liftListItemCommand.key))
    : editor.action(callCommand(wrapInBulletListCommand.key)),
"ordered-list": () =>
  activeState["ordered-list"].active
    ? editor.action(callCommand(liftListItemCommand.key))
    : editor.action(callCommand(wrapInOrderedListCommand.key)),
blockquote: () =>
  activeState.blockquote.active
    ? runProseCommand(editor, lift)
    : editor.action(callCommand(wrapInBlockquoteCommand.key)),
```

- [ ] **Step 8: Run the focused controller tests and the type checker**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/milkdown-editor.test.ts
npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 9: Commit the controller toggles**

```bash
git add src/features/boards/editor/markdown-editor/milkdown-editor.ts src/features/boards/editor/markdown-editor/milkdown-editor.test.ts
git commit -m "fix: toggle rich editor block formats"
```

---

### Task 2: Active-Link Toggle, Toolbar Groups, and Help Footer

**Files:**
- Modify: `src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx`
- Modify: `src/features/boards/editor/markdown-editor/markdown-content-editor.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: unchanged `ToolbarState`, `MarkdownEditorController.run("link")`, and `ariaDescribedBy` controller option.
- Produces: grouped toolbar markup with `.markdown-toolbar-group`, direct active-link removal, and `.markdown-editor-help` footer markup.

- [ ] **Step 1: Write failing component tests**

Add tests whose mutations are “always open link form,” “flatten toolbar groups,” and “place guidance inside editable padding”:

```tsx
it("removes an active link from the toolbar without opening the URL form", async () => {
  const editor = createFakeController({
    ...defaultToolbarState,
    link: { active: true, enabled: true },
  });
  render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      maxLength={200_000}
      onChange={vi.fn()}
      value="[안내](/guide)"
    />,
  );

  fireEvent.click(await screen.findByRole("button", { name: "링크" }));
  expect(editor.run).toHaveBeenCalledWith("link");
  expect(screen.queryByLabelText("URL")).not.toBeInTheDocument();
});

it("groups formatting controls and renders help as a separate footer", async () => {
  const editor = createFakeController();
  const { container } = render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      maxLength={200_000}
      onChange={vi.fn()}
      value="본문"
    />,
  );

  await screen.findByRole("button", { name: "굵게" });
  expect(container.querySelectorAll(".markdown-toolbar-group")).toHaveLength(5);
  const help = screen.getByText("서식 도구 또는 Markdown 원문으로 본문을 편집할 수 있습니다.");
  expect(help).toHaveClass("markdown-editor-help");
  expect(help.parentElement).toHaveClass("markdown-rich-surface");
  expect(help.previousElementSibling).toHaveClass("markdown-editor-mount");
});
```

- [ ] **Step 2: Run the component test and verify both new cases fail**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx
```

Expected: active link opens `URL`; there are no toolbar group wrappers or named help/mount classes.

- [ ] **Step 3: Route active link clicks to removal**

Change `runToolbarCommand`:

```ts
if (command === "link") {
  if (toolbarState.link.active) {
    controllerRef.current?.run("link");
    controllerRef.current?.focus();
  } else {
    setLinkFormVisible(true);
  }
  return;
}
```

- [ ] **Step 4: Group toolbar controls and name the help footer**

Replace the flat `toolbarItems` array with five group arrays in this order: headings/emphasis (`heading-2`, `heading-3`, `bold`, `italic`), link, lists/blockquote, insertion (`horizontal-rule`), history (`undo`, `redo`). Render each as:

```tsx
<div className="markdown-toolbar-group" key={groupName}>
  {items.map(([command, label]) => /* existing button markup */)}
</div>
```

Change the rich surface body to:

```tsx
<div className="markdown-editor-mount" ref={rootRef} />
<p className="markdown-editor-help" id={richEditorHelpId}>
  서식 도구 또는 Markdown 원문으로 본문을 편집할 수 있습니다.
</p>
```

- [ ] **Step 5: Add minimal group and footer CSS**

Make `.markdown-toolbar` align groups with `gap: 0.65rem`, and add:

```css
.markdown-toolbar-group {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.25rem;
  padding-inline-end: 0.65rem;
  border-inline-end: 1px solid var(--line);
}

.markdown-toolbar-group:last-child {
  padding-inline-end: 0;
  border-inline-end: 0;
}

.markdown-rich-surface {
  padding: 0;
}

.markdown-editor-mount {
  padding: 0.9rem 1rem;
}

.markdown-editor-help {
  margin: 0;
  padding: 0.55rem 1rem;
  border-top: 1px solid var(--line);
  color: color-mix(in srgb, var(--foreground) 68%, transparent);
  font-size: 0.8rem;
  font-weight: 700;
}
```

Update the existing generic tabpanel paragraph rule so it does not override `.markdown-editor-help` margins/padding.

- [ ] **Step 6: Run component tests, lint, and typecheck**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx
npm run lint
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the toolbar/help refinement**

```bash
git add src/features/boards/editor/markdown-editor/markdown-content-editor.tsx src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx src/app/globals.css
git commit -m "feat: refine rich editor toolbar layout"
```

---

### Task 3: Visible List Markers and Center Alignment

**Files:**
- Modify: `src/features/boards/markdown/board-markdown.test.tsx`
- Modify: `src/features/boards/markdown/board-markdown.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/e2e/board-owner.spec.ts`

**Interfaces:**
- Consumes: `BoardMarkdown({ markdown, className? })` and existing `.align-center` theme class applied by owner preview/public view.
- Produces: stable list-type class hooks and computed marker/alignment behavior in real browsers.

- [ ] **Step 1: Write a failing renderer test for list-type hooks**

Add custom list renderers to the expected component contract first:

```tsx
it("distinguishes unordered and ordered lists for marker styling", () => {
  render(<BoardMarkdown markdown={"- 글머리\n\n1. 번호"} />);

  expect(screen.getAllByRole("list")[0]).toHaveClass("board-markdown-list-unordered");
  expect(screen.getAllByRole("list")[1]).toHaveClass("board-markdown-list-ordered");
});
```

- [ ] **Step 2: Run the renderer test and verify it fails on missing classes**

Run:

```bash
npm run test:run -- src/features/boards/markdown/board-markdown.test.tsx
```

Expected: both lists render but lack the named list-type classes.

- [ ] **Step 3: Add explicit list renderers**

Extend `BOARD_MARKDOWN_COMPONENTS`:

```tsx
ul({ children }) {
  return <ul className="board-markdown-list-unordered">{children}</ul>;
},
ol({ children, start }) {
  return (
    <ol className="board-markdown-list-ordered" start={start}>
      {children}
    </ol>
  );
},
```

- [ ] **Step 4: Run the renderer test and confirm it passes**

Run the Task 3 focused renderer command. Expected: PASS.

- [ ] **Step 5: Restore rich and rendered list markers in CSS**

Add explicit marker rules:

```css
.markdown-rich-surface .ProseMirror ul,
.board-markdown-list-unordered {
  list-style-type: disc;
}

.markdown-rich-surface .ProseMirror ol,
.board-markdown-list-ordered {
  list-style-type: decimal;
}
```

Keep `padding-inline-start: 1.5rem` for both editor and rendered lists.

- [ ] **Step 6: Add center-aligned rendered-list layout**

Remove the unconditional `text-align: start` declaration from `.board-markdown ul, .board-markdown ol`, then add:

```css
.align-center .board-markdown > ul,
.align-center .board-markdown > ol {
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
  text-align: center;
  list-style-position: inside;
}

.align-center .board-markdown > ul ul,
.align-center .board-markdown > ul ol,
.align-center .board-markdown > ol ul,
.align-center .board-markdown > ol ol {
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
}
```

Do not change `.board-markdown pre { text-align: left; }` or table layout.

- [ ] **Step 7: Extend the authenticated browser test**

Before returning to rich mode, select center alignment and assert real computed styles:

```ts
await page.getByLabel("정렬").selectOption("center");
const unorderedList = preview.locator(".board-markdown-list-unordered");
const orderedList = preview.locator(".board-markdown-list-ordered");
await expect(unorderedList).toHaveCSS("list-style-type", "disc");
await expect(orderedList).toHaveCSS("list-style-type", "decimal");
await expect(unorderedList).toHaveCSS("text-align", "center");
await expect(orderedList).toHaveCSS("text-align", "center");
```

After switching to rich mode, assert `.ProseMirror ul` is `disc`, `.ProseMirror ol` is `decimal`, `.markdown-editor-help` has a nonzero top border, and retain the existing 375 px toolbar containment check.

- [ ] **Step 8: Run focused unit tests and available browser coverage**

Run:

```bash
npm run test:run -- src/features/boards/markdown/board-markdown.test.tsx src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx
npm run test:e2e -- tests/e2e/board-owner.spec.ts
```

Expected: unit tests PASS. The owner test PASSes when `E2E_OWNER_STORAGE_STATE` is configured; otherwise Playwright reports it skipped for the existing documented reason.

- [ ] **Step 9: Commit list rendering and alignment**

```bash
git add src/features/boards/markdown/board-markdown.tsx src/features/boards/markdown/board-markdown.test.tsx src/app/globals.css tests/e2e/board-owner.spec.ts
git commit -m "fix: show and center Markdown lists"
```

---

### Task 4: Regression and Visual Verification

**Files:**
- Modify only when a failure proves a regression in an in-scope file from Tasks 1-3.

**Interfaces:**
- Consumes: all Task 1-3 changes.
- Produces: verified repository state with no unresolved lint, type, unit, build, security, or high-severity audit failures.

- [ ] **Step 1: Run the complete repository verification**

```bash
npm run verify
```

Expected: lint, typecheck, full Vitest suite, production build, and client-secret scan all PASS.

- [ ] **Step 2: Run the high-severity dependency audit**

```bash
npm audit --audit-level=high
```

Expected: no high- or critical-severity vulnerabilities.

- [ ] **Step 3: Inspect the final diff and repository state**

```bash
git diff --check
git status --short
git log -4 --oneline
```

Expected: no whitespace errors; only deliberate implementation-plan/spec amendments remain if not already committed; the three implementation commits are present.

- [ ] **Step 4: Commit the corrected spec and implementation plan if they remain uncommitted**

```bash
git add docs/superpowers/specs/2026-07-29-informationboard-rich-editor-toolbar-list-design.md docs/superpowers/plans/2026-07-29-informationboard-rich-editor-toolbar-list.md
git commit -m "docs: plan rich editor toolbar refinements"
```

- [ ] **Step 5: Report verification evidence**

Include the exact `npm run verify` result, audit result, owner E2E pass/skip status, commits created, and any environment-dependent visual check that could not run. Do not claim browser verification passed when the authenticated storage state was unavailable.
