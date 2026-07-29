# InformationBoard Rich Markdown Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the board Markdown textarea with a Milkdown-based rich editor and source mode while preserving Markdown autosave, safe rendering, intentional summary line breaks, and the restrained public document style.

**Architecture:** `BoardEditor` continues to own the canonical Markdown string and the existing autosave/recovery flow. A focused React component wraps an imperative Milkdown controller, exposes rich/source modes and an accessible toolbar, and emits only Markdown strings; `BoardMarkdown` remains the shared sanitized renderer for preview and public pages.

**Tech Stack:** Next.js 16.2.12, React 19.2.8, TypeScript 6.0.3, Milkdown Kit 7.21.3, react-markdown 10.1.0, Vitest 4.1.10, Testing Library 16.3.2, Playwright 1.62.0.

## Global Constraints

- Store one canonical Markdown string; do not introduce editor JSON or rendered HTML persistence.
- Keep the existing 750 ms `BoardEditor` autosave, revision, conflict, and local recovery flow.
- Retain the 200,000-character Markdown limit and 300-character summary limit.
- Keep raw HTML disabled and reuse `sanitizeBoardUrl` for authored links.
- Rich mode supports H2, H3, bold, italic, link, unordered list, ordered list, blockquote, horizontal rule, undo, and redo.
- Preserve GFM table and strikethrough syntax during rich/source round trips without adding first-version toolbar buttons for them.
- H2 and H3 receive typography and spacing only; never add implicit divider lines.
- Render a divider only for an authored Markdown horizontal rule.
- Preserve summary newlines with `white-space: pre-wrap` in preview and public output.
- Use exact dependency version `@milkdown/kit@7.21.3`.
- Implement behavior test-first and keep each task independently reviewable.

---

## File Structure

- `src/features/boards/editor/markdown-editor/types.ts`: shared controller, command, toolbar-state, and factory interfaces.
- `src/features/boards/editor/markdown-editor/milkdown-editor.ts`: Milkdown setup, serialization, command mapping, selection state, and external-value synchronization.
- `src/features/boards/editor/markdown-editor/milkdown-editor.test.ts`: real Milkdown controller round-trip and command tests.
- `src/features/boards/editor/markdown-editor/markdown-content-editor.tsx`: accessible rich/source mode UI, toolbar, link form, error fallback, and controller lifecycle.
- `src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx`: UI tests using an injected fake controller factory.
- `src/features/boards/editor/board-editor.tsx`: replaces the direct Markdown textarea with `MarkdownContentEditor`.
- `src/features/boards/editor/board-editor.test.tsx`: verifies integration with canonical draft state, autosave, recovery, and conflict replacement.
- `src/features/boards/markdown/board-markdown.tsx`: adds a decorative external-link indicator without changing accessible link names.
- `src/features/boards/markdown/board-markdown.test.tsx`: verifies sample Markdown hierarchy, authored horizontal rules, link indicator, and safety.
- `src/features/boards/public/public-board-view.test.tsx`: verifies multiline summary content remains one semantic summary.
- `src/app/globals.css`: Milkdown/editor controls, summary newline handling, and restrained Markdown typography/list/link/hr styling.
- `vitest.setup.ts`: only add missing DOM polyfills if the real Milkdown controller test demonstrates they are required.
- `tests/e2e/board-owner.spec.ts`: authenticated rich/source editor and computed-style smoke coverage.
- `package.json`, `package-lock.json`: exact Milkdown dependency.

---

### Task 1: Milkdown Controller Contract and Basic Round Trip

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/features/boards/editor/markdown-editor/types.ts`
- Create: `src/features/boards/editor/markdown-editor/milkdown-editor.ts`
- Create: `src/features/boards/editor/markdown-editor/milkdown-editor.test.ts`
- Modify only if required by a demonstrated test failure: `vitest.setup.ts`

**Interfaces:**
- Consumes: `sanitizeBoardUrl(input: string): string` from `src/features/boards/markdown/url.ts`.
- Produces: `MarkdownEditorCommand`, `ToolbarState`, `MarkdownEditorController`, `CreateMarkdownEditorController`, and `createMilkdownEditorController(options)`.

- [ ] **Step 1: Install the exact Milkdown dependency**

Run:

```bash
npm install --save-exact @milkdown/kit@7.21.3
```

Expected: `package.json` contains `"@milkdown/kit": "7.21.3"` and the lockfile resolves all Milkdown packages to 7.21.3.

- [ ] **Step 2: Define the controller contract**

Create `types.ts` with the exact public boundary used by the React component:

```ts
export type MarkdownEditorCommand =
  | "heading-2"
  | "heading-3"
  | "bold"
  | "italic"
  | "link"
  | "bullet-list"
  | "ordered-list"
  | "blockquote"
  | "horizontal-rule"
  | "undo"
  | "redo";

export type ToolbarState = Record<
  MarkdownEditorCommand,
  { active: boolean; enabled: boolean }
>;

export type MarkdownEditorController = {
  getMarkdown(): string;
  replaceMarkdown(markdown: string): void;
  run(command: MarkdownEditorCommand, payload?: { href?: string }): boolean;
  getToolbarState(): ToolbarState;
  focus(): void;
  destroy(): Promise<void>;
};

export type CreateMarkdownEditorController = (options: {
  root: HTMLElement;
  markdown: string;
  onMarkdownChange(markdown: string): void;
  onToolbarStateChange(state: ToolbarState): void;
}) => Promise<MarkdownEditorController>;
```

- [ ] **Step 3: Write a failing real-controller round-trip test**

Create `milkdown-editor.test.ts` with the sample content and no mocks:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMilkdownEditorController } from "./milkdown-editor";

const sample = `## 일정

- **날짜:** 2026년 7월 6일 ~ 8월 1일
- **작가 정보:** 인형작가 남정희

## 장소

[원주 책방 틈](https://www.instagram.com/chaegbang_teum/)

## 프로그램

1. 얼글 브로치 만들기
2. 종이로 만드는 어린이 집`;

describe("createMilkdownEditorController", () => {
  const controllers: Array<{ destroy(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(controllers.splice(0).map((item) => item.destroy()));
  });

  it("loads and serializes the existing board Markdown", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const onMarkdownChange = vi.fn();
    const controller = await createMilkdownEditorController({
      root,
      markdown: sample,
      onMarkdownChange,
      onToolbarStateChange: vi.fn(),
    });
    controllers.push(controller);

    expect(controller.getMarkdown()).toContain("## 일정");
    expect(controller.getMarkdown()).toContain("- **날짜:**");
    expect(controller.getMarkdown()).toContain("1. 얼글 브로치 만들기");
    expect(root.querySelector("h2")).toHaveTextContent("일정");
    expect(root.querySelector("ol")).toBeInTheDocument();
    expect(onMarkdownChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run the focused test and verify it fails**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/milkdown-editor.test.ts
```

Expected: FAIL because `createMilkdownEditorController` does not exist.

- [ ] **Step 5: Implement minimal Milkdown creation and serialization**

Create `milkdown-editor.ts` around these exact Milkdown APIs:

```ts
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  rootCtx,
} from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getMarkdown, replaceAll } from "@milkdown/kit/utils";
import type {
  CreateMarkdownEditorController,
  MarkdownEditorController,
  ToolbarState,
} from "./types";

export const createMilkdownEditorController: CreateMarkdownEditorController =
  async ({ root, markdown, onMarkdownChange, onToolbarStateChange }) => {
    let lastExternalMarkdown = markdown;
    let applyingExternalValue = false;

    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, markdown);
        ctx.get(listenerCtx).markdownUpdated((_ctx, next, previous) => {
          if (applyingExternalValue || next === previous) return;
          lastExternalMarkdown = next;
          onMarkdownChange(next);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      .create();

    const controller: MarkdownEditorController = {
      getMarkdown: () => editor.action(getMarkdown()),
      replaceMarkdown: (next) => {
        if (next === lastExternalMarkdown) return;
        applyingExternalValue = true;
        editor.action(replaceAll(next, true));
        lastExternalMarkdown = next;
        applyingExternalValue = false;
      },
      run: () => false,
      getToolbarState: () => createDefaultToolbarState(),
      focus: () => editor.action((ctx) => ctx.get(editorViewCtx).focus()),
      destroy: async () => {
        await editor.destroy();
      },
    };

    onToolbarStateChange(controller.getToolbarState());
    return controller;
  };
```

Add a local `createDefaultToolbarState()` that returns all commands with `{ active: false, enabled: true }`; Task 2 replaces this temporary bootstrap state with live ProseMirror state.

- [ ] **Step 6: Add only demonstrated DOM polyfills and rerun**

If the test fails because jsdom lacks `ResizeObserver`, add this minimal polyfill to `vitest.setup.ts`:

```ts
class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub;
```

Do not add speculative polyfills. Re-run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/milkdown-editor.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the controller foundation**

```bash
git add package.json package-lock.json vitest.setup.ts src/features/boards/editor/markdown-editor/types.ts src/features/boards/editor/markdown-editor/milkdown-editor.ts src/features/boards/editor/markdown-editor/milkdown-editor.test.ts
git commit -m "feat: add Milkdown editor controller"
```

---

### Task 2: Toolbar Commands, Selection State, and External Synchronization

**Files:**
- Modify: `src/features/boards/editor/markdown-editor/milkdown-editor.ts`
- Modify: `src/features/boards/editor/markdown-editor/milkdown-editor.test.ts`

**Interfaces:**
- Consumes: the Task 1 `MarkdownEditorController` contract and `sanitizeBoardUrl(input)`.
- Produces: all command mappings, accurate `ToolbarState`, safe link behavior, and loop-free `replaceMarkdown` behavior used by Task 3.

- [ ] **Step 1: Write failing command and synchronization tests**

Add focused tests that place a text selection through `editorViewCtx` via a test-only helper exported under `export const __testing`, then assert:

```ts
it("runs the agreed heading, emphasis, list, rule, undo, and redo commands", async () => {
  const { controller, root } = await setup("선택할 문장");
  __testing.selectText(controller, 1, 7);

  expect(controller.run("bold")).toBe(true);
  expect(controller.getMarkdown()).toContain("**선택할 문장**");
  expect(controller.run("undo")).toBe(true);
  expect(controller.getMarkdown()).toBe("선택할 문장");
  expect(controller.run("redo")).toBe(true);
  expect(root.querySelector("strong")).toBeInTheDocument();

  controller.run("heading-2");
  expect(root.querySelector("h2")).toBeInTheDocument();
  controller.run("horizontal-rule");
  expect(controller.getMarkdown()).toContain("---");
});

it("rejects unsafe links and accepts safe links", async () => {
  const { controller } = await setup("원주 책방 틈");
  __testing.selectText(controller, 1, 8);

  expect(controller.run("link", { href: "javascript:alert(1)" })).toBe(false);
  expect(controller.getMarkdown()).not.toContain("javascript:");
  expect(controller.run("link", { href: "https://example.com" })).toBe(true);
  expect(controller.getMarkdown()).toContain("[원주 책방 틈](https://example.com)");
});

it("does not re-emit an externally replaced Markdown value", async () => {
  const onMarkdownChange = vi.fn();
  const { controller } = await setup("처음", { onMarkdownChange });
  controller.replaceMarkdown("## 서버 복구본");

  expect(controller.getMarkdown()).toBe("## 서버 복구본");
  expect(onMarkdownChange).not.toHaveBeenCalled();
});

it("round-trips GFM tables and strikethrough", async () => {
  const markdown = "~~마감~~\\n\\n| 시간 | 내용 |\\n| --- | --- |\\n| 14:00 | 시작 |";
  const { controller } = await setup(markdown);
  expect(controller.getMarkdown()).toContain("~~마감~~");
  expect(controller.getMarkdown()).toContain("| 시간 | 내용 |");
});
```

The `__testing` helper must accept the public controller rather than exporting the Milkdown `Editor` instance in production UI code. Keep the controller-to-editor association in a module-private `WeakMap<MarkdownEditorController, Editor>` and expose only the selection operation through `__testing`.

- [ ] **Step 2: Run the tests and verify failures identify missing mappings**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/milkdown-editor.test.ts
```

Expected: FAIL because Task 1 returns `false` for commands and static toolbar state.

- [ ] **Step 3: Implement command mapping with official command keys**

Map commands through `editor.action(callCommand(...))`:

```ts
const commandActions = {
  "heading-2": () => editor.action(callCommand(wrapInHeadingCommand.key, 2)),
  "heading-3": () => editor.action(callCommand(wrapInHeadingCommand.key, 3)),
  bold: () => editor.action(callCommand(toggleStrongCommand.key)),
  italic: () => editor.action(callCommand(toggleEmphasisCommand.key)),
  "bullet-list": () => editor.action(callCommand(wrapInBulletListCommand.key)),
  "ordered-list": () => editor.action(callCommand(wrapInOrderedListCommand.key)),
  blockquote: () => editor.action(callCommand(wrapInBlockquoteCommand.key)),
  "horizontal-rule": () => editor.action(callCommand(insertHrCommand.key)),
  undo: () => editor.action(callCommand(undoCommand.key)),
  redo: () => editor.action(callCommand(redoCommand.key)),
};
```

Handle `link` separately: sanitize `payload.href` with `sanitizeBoardUrl`; call `toggleLinkCommand` only for a safe non-empty URL, and call the same command without attributes to remove the current mark.

- [ ] **Step 4: Compute toolbar state from ProseMirror selection**

Inside `editor.action`, read `editorViewCtx`, `headingSchema`, `strongSchema`, `emphasisSchema`, `linkSchema`, list schemas, and blockquote schema. Use `storedMarks ?? selection.$from.marks()` for an empty selection and `doc.rangeHasMark(from, to, markType)` for a range. Mark H2/H3 active only when `$from.parent.type` is `headingSchema.type(ctx)` with the matching level.

For `enabled`, invoke the corresponding ProseMirror command with `dispatch` omitted, or use `commandsCtx.call` only where it does not dispatch. Recompute after both `markdownUpdated` and `selectionUpdated`; emit only when the next record differs from the previous one.

- [ ] **Step 5: Make external replacement validated and exception-safe**

Before replacement, call `ctx.get(parserCtx)(next)` through `editor.action`; throw a named `MarkdownParseError` if it returns no document. Wrap `replaceAll(next, true)` in `try/finally` so `applyingExternalValue` always resets. Update `lastExternalMarkdown` from `getMarkdown()` after replacement so Milkdown normalization cannot create a feedback loop. Let parse exceptions propagate to the React component without emitting a partial value.

- [ ] **Step 6: Run controller and URL safety tests**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/milkdown-editor.test.ts src/features/boards/markdown/url.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the complete controller**

```bash
git add src/features/boards/editor/markdown-editor/milkdown-editor.ts src/features/boards/editor/markdown-editor/milkdown-editor.test.ts
git commit -m "feat: add rich Markdown editing commands"
```

---

### Task 3: Accessible Rich/Source Editor UI

**Files:**
- Create: `src/features/boards/editor/markdown-editor/markdown-content-editor.tsx`
- Create: `src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `CreateMarkdownEditorController`, `MarkdownEditorController`, `MarkdownEditorCommand`, and `ToolbarState` from Tasks 1-2.
- Produces: `MarkdownContentEditor({ value, onChange, id, maxLength, createController? })` for Task 4.

- [ ] **Step 1: Write a fake controller factory for component tests**

In `markdown-content-editor.test.tsx`, define a controlled fake matching the real boundary:

```ts
function createFakeController() {
  let markdown = "";
  const run = vi.fn(() => true);
  const replaceMarkdown = vi.fn((next: string) => {
    markdown = next;
  });
  const factory: CreateMarkdownEditorController = vi.fn(async (options) => {
    markdown = options.markdown;
    return {
      getMarkdown: () => markdown,
      replaceMarkdown,
      run,
      getToolbarState: () => defaultToolbarState,
      focus: vi.fn(),
      destroy: vi.fn(async () => undefined),
    };
  });
  return { factory, run, replaceMarkdown };
}
```

- [ ] **Step 2: Write failing mode, toolbar, and fallback tests**

Cover the user contract with Testing Library:

```tsx
it("switches between rich text and Markdown source without losing edits", async () => {
  const editor = createFakeController();
  const onChange = vi.fn();
  render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      maxLength={200_000}
      onChange={onChange}
      value="## 일정"
    />,
  );

  await screen.findByRole("tab", { name: "리치 텍스트" });
  fireEvent.click(screen.getByRole("tab", { name: "Markdown 원문" }));
  fireEvent.change(screen.getByLabelText("본문 Markdown 원문"), {
    target: { value: "## 프로그램\\n\\n1. 만들기" },
  });

  expect(onChange).toHaveBeenLastCalledWith("## 프로그램\\n\\n1. 만들기");
  fireEvent.click(screen.getByRole("tab", { name: "리치 텍스트" }));
  expect(editor.replaceMarkdown).toHaveBeenCalledWith(
    "## 프로그램\\n\\n1. 만들기",
  );
});

it("exposes the agreed toolbar with accessible pressed and disabled states", async () => {
  // Render with bold active and redo disabled in the fake ToolbarState.
  expect(await screen.findByRole("button", { name: "굵게" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "다시 실행" })).toBeDisabled();
});

it("falls back to source mode when Milkdown initialization fails", async () => {
  const failedFactory = vi.fn(async () => {
    throw new Error("mount failed");
  });
  render(
    <MarkdownContentEditor
      createController={failedFactory}
      id="board-content"
      maxLength={200_000}
      onChange={vi.fn()}
      value="## 보존할 내용"
    />,
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "리치 텍스트 편집기를 열지 못해 Markdown 원문 모드로 전환했습니다.",
  );
  expect(screen.getByLabelText("본문 Markdown 원문")).toHaveValue(
    "## 보존할 내용",
  );
});
```

Also test:

- when `replaceMarkdown` throws during a source-to-rich switch, the component remains in source mode, preserves the exact textarea value, and announces `Markdown을 리치 텍스트로 변환하지 못했습니다. 원문은 그대로 보존했습니다.`;
- when the controller emits a string longer than `maxLength`, `onChange` is not called, the last accepted `value` is restored through `replaceMarkdown`, and an alert explains the 200,000-character limit;
- the inline link form: the `링크` button reveals a labeled `URL` input plus `적용` and `링크 제거` buttons; applying delegates to `run("link", { href })` and a false result displays `안전한 http, https, mailto 또는 내부 링크를 입력해 주세요.`

- [ ] **Step 3: Run the focused UI test and verify it fails**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx
```

Expected: FAIL because `MarkdownContentEditor` does not exist.

- [ ] **Step 4: Implement the React lifecycle and mode switch**

Implement a client component with this public signature:

```ts
type MarkdownContentEditorProps = {
  id: string;
  maxLength: number;
  value: string;
  onChange(markdown: string): void;
  createController?: CreateMarkdownEditorController;
};
```

Use a `rootRef`, `controllerRef`, and `latestValueRef`. Initialize once in `useEffect`, destroy on cleanup, and ignore completion after unmount. On `value` changes, call `replaceMarkdown` only when `controller.getMarkdown() !== value`. Catch initialization or replacement errors, preserve `value`, select source mode, and show the approved Korean alert. Wrap the controller's `onMarkdownChange`: accept and forward only strings whose length is at most `maxLength`; otherwise restore `latestValueRef.current` and show a length-limit alert.

Use two tabs with `aria-controls`, `aria-selected`, and matching tab panels. Keep only the active editor surface interactive. Source input calls `onChange(event.currentTarget.value)` directly and displays a character counter derived from `value.length`.

- [ ] **Step 5: Implement the toolbar and link form**

Create a constant button definition array so labels and commands cannot drift:

```ts
const toolbarItems = [
  ["heading-2", "제목 2"],
  ["heading-3", "제목 3"],
  ["bold", "굵게"],
  ["italic", "기울임"],
  ["link", "링크"],
  ["bullet-list", "글머리 목록"],
  ["ordered-list", "번호 목록"],
  ["blockquote", "인용"],
  ["horizontal-rule", "구분선"],
  ["undo", "실행 취소"],
  ["redo", "다시 실행"],
] as const;
```

Buttons call `controller.run`, restore focus, and use the latest emitted `ToolbarState`. Submit the link form without `window.prompt`. Keep the URL in local UI state only and clear it after a successful command.

- [ ] **Step 6: Add focused editor chrome styles**

In `globals.css`, add the Milkdown base imports immediately after the existing Tailwind import:

```css
@import "@milkdown/kit/prose/view/style/prosemirror.css";
@import "@milkdown/kit/prose/tables/style/tables.css";
```

Then add `.markdown-content-editor`, `.markdown-editor-header`, `.markdown-mode-tabs`, `.markdown-toolbar`, `.markdown-link-form`, `.markdown-rich-surface`, `.markdown-source-input`, and `.markdown-editor-error`. Follow existing square borders and foreground/background tokens. The toolbar must use `display:flex; flex-wrap:wrap`, buttons must retain the existing 3 px focus outline, and `.ProseMirror` must have a visible minimum height, no default outline, readable list indentation, and the existing editor font.

Do not style public `h2`/`h3` here; Task 5 owns shared rendered Markdown typography.

- [ ] **Step 7: Run the UI test and accessibility-focused lint**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx
npm run lint
```

Expected: PASS.

- [ ] **Step 8: Commit the standalone editor UI**

```bash
git add src/features/boards/editor/markdown-editor/markdown-content-editor.tsx src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx src/app/globals.css
git commit -m "feat: add rich and source Markdown editor"
```

---

### Task 4: BoardEditor Autosave, Recovery, and Conflict Integration

**Files:**
- Modify: `src/features/boards/editor/board-editor.tsx`
- Modify: `src/features/boards/editor/board-editor.test.tsx`

**Interfaces:**
- Consumes: `MarkdownContentEditor` from Task 3 and existing `updateDraft(patch)`.
- Produces: canonical rich/source Markdown flowing through the unchanged `EditorDraft`, autosave, recovery, and conflict logic.

- [ ] **Step 1: Add failing autosave integration coverage through source mode**

Add this test beside the existing 750 ms autosave test:

```tsx
it("autosaves Markdown emitted by the rich/source editor", async () => {
  const update = vi.fn(async (): Promise<UpdateBoardResult> => ({
    status: "saved",
    revision: 3,
    updatedAt: "2026-07-28T10:01:00.000Z",
  }));
  render(
    <BoardEditor
      {...publicationProps}
      board={initialBoard}
      deleteBoardAction={vi.fn()}
      updateBoardAction={update}
    />,
  );

  fireEvent.click(screen.getByRole("tab", { name: "Markdown 원문" }));
  fireEvent.change(screen.getByLabelText("본문 Markdown 원문"), {
    target: { value: "## 프로그램\\n\\n1. 얼글 브로치 만들기" },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(750);
  });

  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      contentMarkdown: "## 프로그램\\n\\n1. 얼글 브로치 만들기",
    }),
  );
});
```

Mock only `createMilkdownEditorController` at the module boundary so this integration test does not mount ProseMirror; retain the real component and source-mode behavior.

- [ ] **Step 2: Add failing recovery and conflict synchronization assertions**

Extend the existing recovery/conflict tests to assert that after `복구하기` or `서버 내용 불러오기`, switching to `Markdown 원문` shows the restored/server `contentMarkdown`, not the stale editor value.

- [ ] **Step 3: Run the focused BoardEditor tests and verify the missing UI**

Run:

```bash
npm run test:run -- src/features/boards/editor/board-editor.test.tsx
```

Expected: FAIL because `BoardEditor` still renders the old `본문 Markdown` textarea.

- [ ] **Step 4: Replace only the content textarea**

In `board-editor.tsx`, keep the existing label order and replace:

```tsx
<textarea id="board-content" ... />
```

with:

```tsx
<label id="board-content-label">본문</label>
<MarkdownContentEditor
  id="board-content"
  maxLength={200_000}
  onChange={(contentMarkdown) => updateDraft({ contentMarkdown })}
  value={draft.contentMarkdown}
/>
```

Pass the label id or equivalent accessible name into the component if the Task 3 implementation needs it. Do not alter `runSave`, debounce timing, revision handling, recovery storage, or conflict actions.

- [ ] **Step 5: Run BoardEditor and action tests**

Run:

```bash
npm run test:run -- src/features/boards/editor/board-editor.test.tsx src/features/boards/actions/update-board.test.ts
```

Expected: PASS, including existing autosave sequencing tests.

- [ ] **Step 6: Commit the BoardEditor integration**

```bash
git add src/features/boards/editor/board-editor.tsx src/features/boards/editor/board-editor.test.tsx
git commit -m "feat: integrate rich editor autosave"
```

---

### Task 5: Summary Newlines and Restrained Markdown Rendering

**Files:**
- Modify: `src/features/boards/markdown/board-markdown.tsx`
- Modify: `src/features/boards/markdown/board-markdown.test.tsx`
- Modify: `src/features/boards/public/public-board-view.test.tsx`
- Modify: `src/features/boards/editor/board-editor.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `isExternalBoardUrl` and `sanitizeBoardUrl` from the existing URL policy.
- Produces: preview/public rendering with preserved summary newlines, visible list markers, clear links, explicit-only horizontal rules, and heading spacing without implicit dividers.

- [ ] **Step 1: Add failing sample hierarchy and explicit-rule tests**

Add to `board-markdown.test.tsx`:

```tsx
it("renders the sample hierarchy, list types, and authored horizontal rule", () => {
  const { container } = render(
    <BoardMarkdown markdown={`## 일정

- **날짜:** 2026년 7월 6일 ~ 8월 1일

## 프로그램

1. 얼글 브로치 만들기

---

[원주 책방 틈](https://www.instagram.com/chaegbang_teum/)`} />,
  );

  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(2);
  expect(screen.getAllByRole("list")).toHaveLength(2);
  expect(container.querySelectorAll("hr")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "원주 책방 틈" })).toHaveAttribute(
    "target",
    "_blank",
  );
});

it("adds a decorative indicator only to external links", () => {
  const { container } = render(
    <BoardMarkdown markdown="[외부](https://example.com) [내부](/guide)" />,
  );
  const external = screen.getByRole("link", { name: "외부" });
  expect(external.querySelector('[aria-hidden="true"]')).toHaveTextContent("↗");
  expect(screen.getByRole("link", { name: "내부" })).not.toHaveTextContent("↗");
  expect(container.querySelectorAll("hr")).toHaveLength(0);
});
```

- [ ] **Step 2: Add multiline summary regression coverage**

Update `public-board-view.test.tsx` to render `summary: "첫째 줄\\n둘째 줄"`, then assert the summary test id has that exact `textContent` and remains a single paragraph. Add the same multiline draft to the BoardEditor preview test and assert `preview-summary` contains the newline.

- [ ] **Step 3: Run Markdown and public-view tests**

Run:

```bash
npm run test:run -- src/features/boards/markdown/board-markdown.test.tsx src/features/boards/public/public-board-view.test.tsx src/features/boards/editor/board-editor.test.tsx
```

Expected: the external indicator assertion fails before implementation; existing structure and safety assertions remain green.

- [ ] **Step 4: Render a decorative external-link indicator**

Change only the safe external link branch in `BOARD_MARKDOWN_COMPONENTS.a`:

```tsx
<a href={safeHref} rel="noopener noreferrer" target="_blank">
  {children}
  <span aria-hidden="true" className="external-link-indicator">
    ↗
  </span>
</a>
```

Keep relative and mail links free of the indicator. Do not change URL sanitization or enable raw HTML.

- [ ] **Step 5: Apply the approved restrained document styles**

Update the existing `.board-markdown` block instead of adding a competing style block:

```css
.preview-summary,
.public-board-summary {
  white-space: pre-wrap;
}

.board-markdown > :first-child {
  margin-top: 0;
}

.board-markdown h2 {
  margin: 2.4rem 0 0.8rem;
  font-size: clamp(1.45rem, 3vw, 2rem);
}

.board-markdown h3 {
  margin: 1.8rem 0 0.65rem;
  font-size: clamp(1.15rem, 2.2vw, 1.45rem);
}

.board-markdown ul,
.board-markdown ol {
  margin: 0.75rem 0 1.25rem;
  padding-inline-start: 1.5rem;
  text-align: start;
}

.board-markdown li + li {
  margin-top: 0.35rem;
}

.board-markdown hr {
  margin: 2.5rem 0;
  border: 0;
  border-top: 1px solid var(--foreground);
}

.external-link-indicator {
  margin-inline-start: 0.25em;
  font-size: 0.8em;
}
```

Retain heading `line-height`, link underline offset, blockquote, code, and table rules. Do not add borders or pseudo-elements to `h2` or `h3`. Ensure lists remain left-readable inside `.align-center`.

- [ ] **Step 6: Run renderer, safety, and public-view tests**

Run:

```bash
npm run test:run -- src/features/boards/markdown src/features/boards/public/public-board-view.test.tsx src/features/boards/editor/board-editor.test.tsx
```

Expected: PASS, including raw HTML and unsafe link tests.

- [ ] **Step 7: Commit the rendering improvements**

```bash
git add src/features/boards/markdown/board-markdown.tsx src/features/boards/markdown/board-markdown.test.tsx src/features/boards/public/public-board-view.test.tsx src/features/boards/editor/board-editor.test.tsx src/app/globals.css
git commit -m "feat: refine board Markdown presentation"
```

---

### Task 6: Responsive Browser Coverage and Full Verification

**Files:**
- Modify: `tests/e2e/board-owner.spec.ts`
- Modify only if verification exposes a defect: files owned by Tasks 1-5, with a regression test added beside the fix.

**Interfaces:**
- Consumes: completed rich editor, source mode, autosave, preview rendering, and responsive styles.
- Produces: an authenticated browser smoke test plus complete repository verification evidence.

- [ ] **Step 1: Extend the authenticated owner E2E flow**

After board creation and before deletion, add source-mode editing and preview checks:

```ts
await page.getByRole("tab", { name: "Markdown 원문" }).click();
await page.getByLabel("요약").fill("첫째 줄\\n둘째 줄");
await page.getByLabel("본문 Markdown 원문").fill(`## 일정

- **날짜:** 2026년 7월 6일 ~ 8월 1일

## 프로그램

1. 얼글 브로치 만들기

---

[원주 책방 틈](https://www.instagram.com/chaegbang_teum/)`);
await expect(page.getByRole("status")).toHaveText("저장됨", {
  timeout: 10_000,
});

const preview = page.locator(".editor-preview-panel");
await expect(preview.getByRole("heading", { name: "일정", level: 2 })).toBeVisible();
await expect(preview.getByRole("list")).toHaveCount(2);
await expect(preview.locator(".board-markdown hr")).toHaveCount(1);
await expect(page.locator(".preview-summary")).toHaveCSS(
  "white-space",
  "pre-wrap",
);
```

At a mobile viewport, assert the toolbar wraps within the editor panel by comparing its bounding box right edge to the panel right edge. Do not use a screenshot-only assertion.

- [ ] **Step 2: Run focused unit tests before browser tests**

Run:

```bash
npm run test:run -- src/features/boards/editor src/features/boards/markdown src/features/boards/public/public-board-view.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run the E2E test**

Run:

```bash
npm run test:e2e -- tests/e2e/board-owner.spec.ts
```

Expected: PASS when `E2E_OWNER_STORAGE_STATE` is configured; otherwise the test reports the existing explicit skip. Record the skip honestly rather than claiming authenticated coverage ran.

- [ ] **Step 4: Run complete repository verification**

Run:

```bash
npm run verify
```

Expected: lint, typecheck, all Vitest tests, production build, and client-secret scan pass.

- [ ] **Step 5: Run the dependency audit**

Run:

```bash
npm audit --audit-level=high
```

Expected: no high or critical vulnerabilities. If Milkdown introduces an advisory, report it and stop before claiming completion; do not change unrelated dependencies without approval.

- [ ] **Step 6: Review the final diff for scope and accidental artifacts**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected: only the files named in this plan are changed, no `.superpowers/brainstorm` files are tracked, and `git diff --check` is silent.

- [ ] **Step 7: Commit E2E coverage or final verification fixes**

If only the E2E test changed:

```bash
git add tests/e2e/board-owner.spec.ts
git commit -m "test: cover rich Markdown owner workflow"
```

If verification required a code fix, stage the regression test and its smallest implementation together and use a message describing that specific fix.

---

## Completion Evidence

Before reporting completion, record:

- focused controller and component test results;
- `npm run verify` result;
- authenticated E2E pass or explicit environment skip;
- `npm audit --audit-level=high` result;
- final `git status --short` and commit list.

The final handoff must link the design and this plan, list the exact toolbar and rich/source behavior delivered, state that summary newlines use `pre-wrap`, and confirm that H2/H3 have no automatic divider styling.
