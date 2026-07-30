# InformationBoard Image Modal and Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the uploaded-image alternative-text crash, move image management and deletion into accessible modal dialogs, and support editable 25%, 50%, 75%, and 100% image widths in rich and source editing modes.

**Architecture:** A shared allowlisted image-presentation module owns width metadata parsing and serialization. Milkdown and a focused source-Markdown helper expose the currently selected image and apply one undoable insert/update operation, while a reusable modal shell provides focus behavior and the image library owns management/delete dialog state. Board rendering consumes the same normalized width contract, leaving attachment URLs and server lifecycle actions unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Milkdown 7/ProseMirror, unified/remark-parse, React Markdown 10, Vitest 4, Testing Library, Playwright 1.62.

## Global Constraints

- Supported image widths are exactly `25`, `50`, `75`, and `100` percent.
- Serialized width metadata uses the Markdown title values `width=25`, `width=50`, `width=75`, and `width=100`.
- New insertions serialize a width even when it is 100%; missing or invalid existing metadata renders as 100%.
- The stable `/b/<slug>/images/<attachment-id>` URL remains unchanged and is the only identifier used by delivery and deletion reference checks.
- Raw HTML stays disabled, and renderer styles are selected only from the width allowlist.
- Alternative text is required unless the image is explicitly decorative; decorative images serialize an empty alt string.
- Image management and delete confirmation never appear as stacked dialogs.
- Existing upload, quota, access-control, deletion, and revision-fence server contracts do not change.
- Image insert and update operations obey the existing 200,000-character fence and roll back before autosave sees an oversized value.
- All user-facing failures remain safe Korean copy without paths, SQL, tokens, or stack traces.
- All production changes are test-driven, with a witnessed relevant failure before implementation.

---

## File Map

### Shared presentation contract and rendering

- Create `src/features/boards/images/presentation.ts`: width type, allowlist, title parsing/serialization, and CSS-class mapping.
- Create `src/features/boards/images/presentation.test.ts`: pure width-contract coverage.
- Modify `src/features/boards/markdown/board-markdown.tsx`: consume width metadata without exposing it as a tooltip.
- Modify `src/features/boards/markdown/board-markdown.test.tsx`: allowed widths, fallback, and title behavior.
- Modify `src/app/globals.css`: allowlisted rendered-image width classes.

### Modal foundation

- Create `src/components/modal-dialog.tsx`: accessible modal shell with initial focus, focus containment, Escape handling, and restoration.
- Create `src/components/modal-dialog.test.tsx`: keyboard and focus behavior.
- Modify `src/app/globals.css`: shared modal backdrop, surface, scrolling, and responsive layout.

### Rich and source editor contracts

- Modify `src/features/boards/editor/markdown-editor/types.ts`: selected-image and width-aware mutation contracts.
- Modify `src/features/boards/editor/markdown-editor/milkdown-editor.ts`: selected image inspection and insert/update transaction.
- Modify `src/features/boards/editor/markdown-editor/milkdown-editor.test.ts`: selection, update, serialization, undo, and invalid-width coverage.
- Create `src/features/boards/editor/markdown-editor/source-image.ts`: locate and replace a Markdown image at a textarea selection.
- Create `src/features/boards/editor/markdown-editor/source-image.test.ts`: exact source range and malformed-input coverage.
- Modify `src/features/boards/editor/markdown-editor/markdown-content-editor.tsx`: modal bridge, rich/source selection capture, update/insert fence, and focus restoration.
- Modify `src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx`: bridge, source update, rollback, and open/close behavior.

### Image management UI and integration

- Modify `src/features/boards/images/image-library.tsx`: management modal, uploaded-alt crash fix, width selection, update state, and separate delete dialog.
- Modify `src/features/boards/images/image-library.test.tsx`: regression, modal, sizing, update, deletion, and state restoration tests.
- Modify `src/features/boards/editor/board-editor.tsx`: pass the new editor-image bridge through without changing autosave/revision behavior.
- Modify `src/features/boards/editor/board-editor.test.tsx`: current draft and revision-fence integration.
- Modify `src/app/globals.css`: image modal/card/width control styles and removal of inline panel-only styling.

### End-to-end verification

- Modify `tests/e2e/board-images.spec.ts`: upload, alt edit, 50% insert, reload, existing-image update to 25%, modal deletion, and delivery checks.

---

### Task 1: Define and Render the Image Width Contract

**Files:**
- Create: `src/features/boards/images/presentation.ts`
- Create: `src/features/boards/images/presentation.test.ts`
- Modify: `src/features/boards/markdown/board-markdown.tsx`
- Modify: `src/features/boards/markdown/board-markdown.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `IMAGE_WIDTHS`, `ImageWidth`, `DEFAULT_IMAGE_WIDTH`, `parseImageWidthTitle(title)`, `serializeImageWidthTitle(width)`, and `imageWidthClass(width)`.
- Consumes: React Markdown's image `title` property.

- [ ] **Step 1: Write failing width-contract and renderer tests**

Create `presentation.test.ts` with exact allowlist and fallback assertions:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_WIDTH,
  IMAGE_WIDTHS,
  imageWidthClass,
  parseImageWidthTitle,
  serializeImageWidthTitle,
} from "./presentation";

it("accepts only the four image widths", () => {
  expect(IMAGE_WIDTHS).toEqual([25, 50, 75, 100]);
  expect(DEFAULT_IMAGE_WIDTH).toBe(100);
  expect(parseImageWidthTitle("width=25")).toBe(25);
  expect(parseImageWidthTitle("width=50")).toBe(50);
  expect(parseImageWidthTitle("width=75")).toBe(75);
  expect(parseImageWidthTitle("width=100")).toBe(100);
  expect(parseImageWidthTitle(undefined)).toBe(100);
  expect(parseImageWidthTitle("width=80")).toBe(100);
  expect(parseImageWidthTitle("width=50; color:red")).toBe(100);
});

it("serializes and maps only normalized widths", () => {
  expect(serializeImageWidthTitle(50)).toBe("width=50");
  expect(imageWidthClass(50)).toBe("board-image-width-50");
});
```

Add renderer assertions:

```tsx
render(<BoardMarkdown markdown={`![포스터](${src} "width=50")`} />);
expect(screen.getByRole("img", { name: "포스터" }))
  .toHaveClass("board-image-width-50");
expect(screen.getByRole("img", { name: "포스터" }))
  .not.toHaveAttribute("title");

render(<BoardMarkdown markdown={`![기본](${secondSrc} "width=80")`} />);
expect(screen.getByRole("img", { name: "기본" }))
  .toHaveClass("board-image-width-100");
```

- [ ] **Step 2: Run the focused tests and verify the expected failure**

Run:

```bash
npm run test:run -- src/features/boards/images/presentation.test.ts src/features/boards/markdown/board-markdown.test.tsx
```

Expected: FAIL because `presentation.ts` and width classes do not exist and the renderer still forwards `title`.

- [ ] **Step 3: Implement the minimal width contract and renderer mapping**

Use a readonly tuple and exact parser:

```ts
export const IMAGE_WIDTHS = [25, 50, 75, 100] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];
export const DEFAULT_IMAGE_WIDTH: ImageWidth = 100;

export function parseImageWidthTitle(title?: string): ImageWidth {
  const match = /^width=(25|50|75|100)$/.exec(title ?? "");
  return match ? (Number(match[1]) as ImageWidth) : DEFAULT_IMAGE_WIDTH;
}

export function serializeImageWidthTitle(width: ImageWidth) {
  return `width=${width}`;
}

export function imageWidthClass(width: ImageWidth) {
  return `board-image-width-${width}`;
}
```

In `BoardMarkdown`, normalize the title, set the allowlisted class, and omit the HTML title. Add four explicit CSS selectors:

```css
.board-markdown img.board-image-width-25 { width: 25%; }
.board-markdown img.board-image-width-50 { width: 50%; }
.board-markdown img.board-image-width-75 { width: 75%; }
.board-markdown img.board-image-width-100 { width: 100%; }
```

- [ ] **Step 4: Run focused tests and commit**

Run:

```bash
npm run test:run -- src/features/boards/images/presentation.test.ts src/features/boards/markdown/board-markdown.test.tsx
git diff --check
```

Expected: PASS with no diff errors.

```bash
git add src/features/boards/images/presentation.ts src/features/boards/images/presentation.test.ts src/features/boards/markdown/board-markdown.tsx src/features/boards/markdown/board-markdown.test.tsx src/app/globals.css
git commit -m "feat: render allowlisted image widths"
```

---

### Task 2: Build the Accessible Modal Shell

**Files:**
- Create: `src/components/modal-dialog.tsx`
- Create: `src/components/modal-dialog.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `ModalDialog({ open, title, titleId, returnFocusRef, initialFocusRef, onClose, children })`.
- Consumes: standard React refs and children; no image-domain state.

- [ ] **Step 1: Write failing keyboard and focus tests**

Cover initial focus, Tab/Shift+Tab wrapping, Escape, backdrop close, and focus restoration:

```tsx
function Harness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={triggerRef} onClick={() => setOpen(true)}>열기</button>
    <ModalDialog
      initialFocusRef={firstRef}
      onClose={() => setOpen(false)}
      open={open}
      returnFocusRef={triggerRef}
      title="이미지 관리"
      titleId="image-dialog-title"
    >
      <button ref={firstRef}>첫 작업</button>
      <button>마지막 작업</button>
    </ModalDialog>
  </>;
}
```

Assert `role="dialog"`, `aria-modal="true"`, linked title, initial focus, wrap in both directions, Escape close, and trigger focus after close.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
npm run test:run -- src/components/modal-dialog.test.tsx
```

Expected: FAIL because `ModalDialog` does not exist.

- [ ] **Step 3: Implement the modal shell**

Use a client component that renders nothing when closed, captures the previously focused element on open, focuses `initialFocusRef` or the first focusable descendant, and handles keyboard focus inside a `dialogRef`. Only a pointer event whose target equals the backdrop closes through the backdrop. The dialog surface stops propagation.

Use this focusable selector exactly as the initial contract:

```ts
const FOCUSABLE = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");
```

On cleanup after an open dialog, focus `returnFocusRef.current` when connected, falling back to the previously focused `HTMLElement` when connected.

- [ ] **Step 4: Add responsive modal styles and verify**

Add `.modal-backdrop` and `.modal-dialog` styles with fixed viewport coverage, a high stacking context, `max-height: calc(100dvh - 2rem)`, internal vertical scrolling, and a mobile width of `calc(100vw - 2rem)`.

Run:

```bash
npm run test:run -- src/components/modal-dialog.test.tsx
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit the modal primitive**

```bash
git add src/components/modal-dialog.tsx src/components/modal-dialog.test.tsx src/app/globals.css
git commit -m "feat: add accessible modal dialog"
```

---

### Task 3: Add Rich-Editor Image Selection and Update Transactions

**Files:**
- Modify: `src/features/boards/editor/markdown-editor/types.ts`
- Modify: `src/features/boards/editor/markdown-editor/milkdown-editor.ts`
- Modify: `src/features/boards/editor/markdown-editor/milkdown-editor.test.ts`

**Interfaces:**
- Consumes: `ImageWidth`, `parseImageWidthTitle`, and `serializeImageWidthTitle` from Task 1.
- Produces: `SelectedEditorImage`, `MarkdownEditorController.getSelectedImage()`, and width-aware `MarkdownEditorPayload`.

- [ ] **Step 1: Write failing selected-image and update tests**

Define the intended public types in the tests:

```ts
export type SelectedEditorImage = {
  src: string;
  alt: string;
  width: ImageWidth;
};

export type MarkdownEditorPayload = {
  href?: string;
  src?: string;
  alt?: string;
  width?: ImageWidth;
  replaceSelectedImage?: boolean;
};
```

Use a Markdown document containing `![원본](<url> "width=50")`, select its ProseMirror image node through a new test helper, and assert:

```ts
expect(controller.getSelectedImage()).toEqual({
  src: imageUrl,
  alt: "원본",
  width: 50,
});
expect(controller.run("image", {
  src: imageUrl,
  alt: "수정",
  width: 25,
  replaceSelectedImage: true,
})).toBe(true);
expect(controller.getMarkdown()).toContain(
  `![수정](${imageUrl} "width=25")`,
);
controller.run("undo");
expect(controller.getMarkdown()).toContain(
  `![원본](${imageUrl} "width=50")`,
);
```

Also assert that insertion serializes `width=100`, selection of a non-image returns `null`, an unsupported runtime width returns `false`, and `replaceSelectedImage: true` returns `false` when no image node is selected.

- [ ] **Step 2: Run the Milkdown test and verify failure**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/milkdown-editor.test.ts
```

Expected: FAIL because the controller cannot inspect or replace selected image nodes and insertion writes an empty title.

- [ ] **Step 3: Implement inspection and one-transaction update**

Add `getSelectedImage()` to the controller. Read only a ProseMirror `NodeSelection` whose node type equals `imageSchema.type(ctx)`, sanitize its `src`, and normalize its title width.

For updates, validate `src`, width membership, and the selected image node before dispatching one transaction:

```ts
const transaction = view.state.tr.setNodeMarkup(
  view.state.selection.from,
  undefined,
  {
    src,
    alt: payload.alt ?? "",
    title: serializeImageWidthTitle(width),
  },
);
view.dispatch(transaction.scrollIntoView());
return true;
```

For insertion, continue using `insertImageCommand`, but pass the serialized title. Extend `__testing` with a narrowly scoped helper that creates a `NodeSelection` at a supplied document position.

- [ ] **Step 4: Verify, typecheck, and commit**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/milkdown-editor.test.ts
npm run typecheck
git diff --check
```

Expected: PASS.

```bash
git add src/features/boards/editor/markdown-editor/types.ts src/features/boards/editor/markdown-editor/milkdown-editor.ts src/features/boards/editor/markdown-editor/milkdown-editor.test.ts
git commit -m "feat: update selected rich editor images"
```

---

### Task 4: Locate and Replace Images in Markdown Source Mode

**Files:**
- Create: `src/features/boards/editor/markdown-editor/source-image.ts`
- Create: `src/features/boards/editor/markdown-editor/source-image.test.ts`

**Interfaces:**
- Consumes: `ImageWidth` and the width title helpers from Task 1; `sanitizeBoardImageUrl`.
- Produces: `SourceImageSelection`, `findSourceImageAtSelection(markdown, start, end)`, and `replaceSourceImage(markdown, selection, input)`.

- [ ] **Step 1: Write failing source-selection tests**

Define:

```ts
export type SourceImageSelection = {
  from: number;
  to: number;
  src: string;
  alt: string;
  width: ImageWidth;
};
```

Test a caret in the alt text, a caret in the URL, and a range covering the node. Assert exact offsets and normalized metadata. Test replacement with escaped alt text:

```ts
const selection = findSourceImageAtSelection(markdown, caret, caret);
expect(selection).toMatchObject({ src: imageUrl, alt: "원본", width: 50 });
expect(replaceSourceImage(markdown, selection!, {
  src: imageUrl,
  alt: "대괄호 ]와 역슬래시 \\",
  width: 25,
})).toContain(
  `![대괄호 \\]와 역슬래시 \\\\](${imageUrl} "width=25")`,
);
```

Also cover no overlap, ordinary links, malformed Markdown, unsafe image URLs, reference-style images without a direct editable node, and selection adjacent to but outside the image.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/source-image.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement AST-backed selection with exact offsets**

Parse with `unified().use(remarkParse)`, visit direct `image` nodes, require numeric `position.start.offset` and `position.end.offset`, and treat a collapsed caret as inside only when `from <= caret && caret <= to`. For a range, require overlap. Return only safe URLs.

`replaceSourceImage` must verify that the current source slice still corresponds to the captured range before replacing it with:

```ts
`![${escapeMarkdownAlt(input.alt)}](${input.src} "${serializeImageWidthTitle(input.width)}")`
```

Export `escapeMarkdownAlt` from this focused helper and remove its duplicate from `markdown-content-editor.tsx` in Task 5.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/source-image.test.ts
git diff --check
```

Expected: PASS.

```bash
git add src/features/boards/editor/markdown-editor/source-image.ts src/features/boards/editor/markdown-editor/source-image.test.ts
git commit -m "feat: edit source markdown images"
```

---

### Task 5: Connect the Editor to Modal Image Insert and Update

**Files:**
- Modify: `src/features/boards/editor/markdown-editor/markdown-content-editor.tsx`
- Modify: `src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx`
- Modify: `src/features/boards/editor/markdown-editor/types.ts`

**Interfaces:**
- Consumes: Tasks 1, 3, and 4 contracts.
- Produces: `ImageEditorBridge` passed to the image-library render prop.

- [ ] **Step 1: Write failing bridge and rollback tests**

Change the render-prop test harness to capture this bridge:

```ts
export type ImageEditorBridge = {
  open: boolean;
  selectedImage: SelectedEditorImage | null;
  applyImage(input: {
    image: BoardImage;
    alt: string;
    width: ImageWidth;
  }): boolean;
  close(): void;
};
```

Test these behaviors independently:

- toolbar click sets `open: true` and captures `controller.getSelectedImage()`;
- rich update passes `replaceSelectedImage: true` only when the chosen board image URL matches the captured selected image;
- choosing a different library image inserts instead of replacing;
- source mode captures a direct image node and replaces it without newlines;
- source mode with no selected node inserts with the existing newline rules;
- successful update publishes exactly one `onChange` value and closes the modal;
- failed, unchanged, unsafe, or over-limit mutation leaves Markdown unchanged and keeps the modal open;
- Escape/`close()` closes and restores focus through the modal shell.

- [ ] **Step 2: Run the focused editor test and verify failure**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx
```

Expected: FAIL because the existing render prop exposes only `(image, alt) => boolean` and the image UI is an inline panel.

- [ ] **Step 3: Implement rich/source bridge state**

Replace `imagePanelVisible` with `imageModalOpen` and captured selection state. On toolbar activation:

- rich mode reads `controller.getSelectedImage()`;
- source mode calls `findSourceImageAtSelection` using the textarea selection;
- open state is then passed through `ImageEditorBridge`.

`applyImage` validates the board URL and delegates to one of two focused paths. Rich mode uses the existing synchronous get/rollback fence around the width-aware controller command. Source mode calls `replaceSourceImage` only when the captured source node URL equals the chosen image URL; otherwise it builds a new width-aware Markdown image at the current selection.

After success, update `latestValueRef`, `sourceValue`, and `onChangeRef` once, clear errors, close the modal, and focus the editor. On failure, preserve open state so the owner can correct input.

- [ ] **Step 4: Run editor tests and typecheck**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx src/features/boards/editor/markdown-editor/milkdown-editor.test.ts src/features/boards/editor/markdown-editor/source-image.test.ts
npm run typecheck
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit the editor bridge**

```bash
git add src/features/boards/editor/markdown-editor/types.ts src/features/boards/editor/markdown-editor/markdown-content-editor.tsx src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx
git commit -m "feat: connect image modal editor updates"
```

---

### Task 6: Convert the Image Library to Management and Delete Modals

**Files:**
- Modify: `src/features/boards/images/image-library.tsx`
- Modify: `src/features/boards/images/image-library.test.tsx`
- Modify: `src/features/boards/editor/board-editor.tsx`
- Modify: `src/features/boards/editor/board-editor.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `ModalDialog`, `ImageEditorBridge`, `IMAGE_WIDTHS`, and existing upload/delete/revision actions.
- Produces: modal image management with persistent local library state and a single active dialog.

- [ ] **Step 1: Write the uploaded-alt crash regression test first**

Use the existing deferred upload fixture, complete a new upload, and dispatch a change whose `currentTarget` is cleared after the handler returns. Assert the uploaded input accepts the edited value and no exception escapes:

```ts
await user.upload(screen.getByLabelText("이미지 추가"), file);
await act(async () => resolveUpload?.({
  status: "ready",
  image: uploadedImage,
  storageBytes: 4,
}));
const alt = screen.getByLabelText("new.gif 대체 텍스트");
await user.clear(alt);
await user.type(alt, "새 설명");
expect(alt).toHaveValue("새 설명");
```

Spy on `window`'s `error` event or use an error boundary so the test fails on the reported `Cannot read properties of null (reading 'value')`, not merely on a missing final value.

- [ ] **Step 2: Write failing modal, sizing, update, and deletion tests**

Update `renderLibrary` to provide an `ImageEditorBridge`. Assert:

- `open: false` renders no dialog;
- `open: true` renders one dialog named `이미지 관리`;
- a selected matching board image initializes its saved alt and width and shows `이미지 수정`;
- selecting 25/50/75/100 and submitting calls `applyImage` with the exact width;
- decorative state sends an empty alt;
- validation failure keeps the dialog open;
- delete replaces management with one `이미지 삭제` confirmation dialog;
- cancel restores management state and focus to the same delete button;
- confirm rechecks current Markdown, calls the existing action only when unused, then returns to management;
- upload failure retains current selection and size;
- closing calls bridge `close()`.

- [ ] **Step 3: Run focused tests and verify the failures**

Run:

```bash
npm run test:run -- src/features/boards/images/image-library.test.tsx src/features/boards/editor/board-editor.test.tsx
```

Expected: FAIL on the crash regression under deferred event handling and because the library is still inline, lacks widths, and nests inline deletion confirmation.

- [ ] **Step 4: Fix event value capture and implement modal state**

Capture values before functional updates:

```ts
onChange={(event) => {
  const value = event.currentTarget.value;
  setAltText((current) => ({
    ...current,
    [image.id]: value,
  }));
}}
```

Keep the `ImageLibrary` mounted so uploaded rows and field values survive dialog transitions. Track `dialog: "manage" | "delete"`, selected image id, per-image alt, decorative ids, and per-image widths. Initialize the matching selected document image from `bridge.selectedImage` when the modal opens; do not overwrite user edits on unrelated rerenders.

Render management and delete states through `ModalDialog`. The width control is a radio group named `<filename> 이미지 크기`, with labels `본문 너비의 25%`, `본문 너비의 50%`, `본문 너비의 75%`, and `본문 너비의 100%`.

Call `bridge.applyImage({ image, alt, width })`. Use `이미지 수정` for a matching selected document image and `<filename> 삽입` otherwise. Preserve all existing upload quota disablement, messages, draft-reference checks, authoritative server results, storage reconciliation, and `onBoardRevision` calls.

- [ ] **Step 5: Integrate through BoardEditor and update styles**

Pass the full bridge from `MarkdownContentEditor` into `ImageLibrary` while continuing to pass `draft.contentMarkdown` and `applyRevisionFence`. Do not change autosave dependencies or server action signatures.

Move the previous `.markdown-image-panel` layout into modal-specific classes. Make the image grid scroll within the modal, use one column on narrow screens, preserve 44px minimum interactive targets, and visually distinguish the selected width radio without relying on color alone.

- [ ] **Step 6: Run focused integration tests and commit**

Run:

```bash
npm run test:run -- src/features/boards/images/image-library.test.tsx src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx src/features/boards/editor/board-editor.test.tsx src/components/modal-dialog.test.tsx
npm run typecheck
git diff --check
```

Expected: PASS.

```bash
git add src/features/boards/images/image-library.tsx src/features/boards/images/image-library.test.tsx src/features/boards/editor/board-editor.tsx src/features/boards/editor/board-editor.test.tsx src/app/globals.css
git commit -m "feat: manage board images in modals"
```

---

### Task 7: Extend the Live Image Workflow and Complete Verification

**Files:**
- Modify: `tests/e2e/board-images.spec.ts`

**Interfaces:**
- Consumes: the complete image modal, width, editor update, rendering, upload, delivery, and deletion behavior from Tasks 1-6.
- Produces: browser-level regression coverage of the owner and visitor workflow.

- [ ] **Step 1: Update the E2E test before final implementation verification**

After opening the image toolbar, assert the `이미지 관리` dialog. Upload the fixture, fill the uploaded alternative text, choose `본문 너비의 50%`, insert, and assert:

```ts
await expect(page.getByRole("dialog", { name: "이미지 관리" }))
  .toBeVisible();
await page.getByRole("radio", { name: "본문 너비의 50%" }).check();
await page.getByRole("button", { name: `${fixtureName} 삽입` }).click();
await expect(editorPreview.getByRole("img", { name: "E2E poster" }))
  .toHaveClass(/board-image-width-50/);
```

Reload, switch to rich mode, select the rendered editor image, reopen the image dialog, change alt to `E2E resized poster`, select 25%, submit `이미지 수정`, and assert preview and later visitor rendering use `board-image-width-25` with the new accessible name.

For deletion, remove the source node, wait for autosave, reopen management, click delete, assert management is absent while exactly one `이미지 삭제` dialog is present, confirm, and retain the existing storage-meter and 404 checks.

- [ ] **Step 2: Run non-live verification first**

Run:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run security:client-secret
```

Expected: every command exits 0 with no lint warnings, type errors, test failures, build failures, or client-secret findings.

- [ ] **Step 3: Run the live image E2E when credentials are configured**

Run:

```bash
npm run test:e2e -- tests/e2e/board-images.spec.ts
```

Expected: PASS when `E2E_OWNER_STORAGE_STATE` and the live Supabase environment are configured. If the repository's explicit environment guard skips the test, report the skip verbatim and do not claim live verification.

- [ ] **Step 4: Inspect the final diff and commit E2E coverage**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Confirm only planned files changed and no generated reports, credentials, `.env` files, or unrelated user changes are staged.

```bash
git add tests/e2e/board-images.spec.ts
git commit -m "test: cover modal image resizing workflow"
```

---

## Final Verification Checklist

- [ ] Re-run `npm run verify` from a clean command invocation and record its exit code.
- [ ] Re-run `npm run test:e2e -- tests/e2e/board-images.spec.ts` when the live environment is available and record pass or guarded skip.
- [ ] Confirm `git diff --check` exits 0.
- [ ] Confirm `git status --short` contains no unintended files.
- [ ] Manually inspect the final Markdown examples for exact `"width=<allowlisted>"` syntax.
- [ ] Confirm the original `Cannot read properties of null (reading 'value')` regression test is present and green.
