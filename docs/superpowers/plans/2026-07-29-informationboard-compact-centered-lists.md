# Compact Centered Markdown Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Markdown list markers and their first text on one centered line while reducing the gap between a parent item and its nested cost list.

**Architecture:** Preserve `BoardMarkdown`, the stored Markdown, and semantic list markup. Characterize the loose-list DOM emitted by `react-markdown`, then apply narrowly scoped list-child rules in the shared board stylesheet and verify their computed layout in Chromium.

**Tech Stack:** React 19, `react-markdown` 10, Vitest 4, Testing Library, Playwright 1.62, CSS

## Global Constraints

- Centered lists keep each number or bullet on the same line as its first text.
- The complete list remains centered, including its visible markers.
- Direct nested lists use a `0.35rem` block margin.
- Left- and right-aligned list marker types and alignment behavior remain unchanged.
- Markdown source and semantic list structure remain unchanged.
- Later paragraphs in multi-paragraph list items remain block-level.
- Do not add or update dependencies.

---

## File Structure

- Modify `src/features/boards/markdown/board-markdown.test.tsx` to characterize the exact loose, nested list markup that the CSS selectors consume.
- Create `tests/e2e/markdown-list-layout.spec.ts` to exercise the shared stylesheet in a real browser without authentication or database state.
- Modify `src/app/globals.css` to normalize the first direct paragraph and direct nested-list spacing inside rendered board lists.

### Task 1: Compact centered loose-list layout

**Files:**
- Modify: `src/features/boards/markdown/board-markdown.test.tsx:96-105`
- Create: `tests/e2e/markdown-list-layout.spec.ts`
- Modify: `src/app/globals.css:1471-1497`

**Interfaces:**
- Consumes: `BoardMarkdown({ markdown, className? })` and the existing `.board-markdown`, `.align-center`, `.board-markdown-list-ordered`, and `.board-markdown-list-unordered` classes.
- Produces: CSS behavior for `.board-markdown li > p:first-child` and direct child `ul`/`ol` elements; no TypeScript API changes.

- [ ] **Step 1: Add the loose nested-list DOM characterization test**

Add this test immediately after the existing marker-styling test in `src/features/boards/markdown/board-markdown.test.tsx`:

```tsx
it("preserves loose list paragraphs and nested cost lists", () => {
  const { container } = render(
    <BoardMarkdown
      markdown={`1. 얼굴 브로치 만들기

   - 비용 - 15,000 원

2. 종이로 만드는 어린이 집

   - 비용 : 15,000 원

3. 8월 1일 전시 연계 프로그램 진행`}
    />,
  );

  const orderedList = container.querySelector(".board-markdown > ol");

  expect(orderedList?.querySelectorAll(":scope > li")).toHaveLength(3);
  expect(orderedList?.querySelectorAll(":scope > li > p")).toHaveLength(3);
  expect(orderedList?.querySelectorAll(":scope > li > ul")).toHaveLength(2);
});
```

- [ ] **Step 2: Run the component test to establish the selector contract**

Run:

```bash
npm run test:run -- src/features/boards/markdown/board-markdown.test.tsx
```

Expected: PASS. This is an explicit characterization test for the existing renderer output; it establishes that the subsequent browser test and CSS target the DOM produced by `BoardMarkdown`.

- [ ] **Step 3: Add the failing browser layout test**

Create `tests/e2e/markdown-list-layout.spec.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("keeps centered loose-list markers with compact nested spacing", async ({
  page,
}) => {
  await page.setContent(`
    <article class="align-center">
      <div class="board-markdown">
        <ol class="board-markdown-list-ordered">
          <li>
            <p>얼굴 브로치 만들기</p>
            <ul class="board-markdown-list-unordered">
              <li>비용 - 15,000 원</li>
            </ul>
          </li>
          <li><p>8월 1일 전시 연계 프로그램 진행</p></li>
        </ol>
      </div>
    </article>
  `);
  await page.addStyleTag({
    content: await readFile(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    ),
  });

  const firstParagraph = page.locator(".board-markdown > ol > li > p").first();
  const nestedList = page.locator(".board-markdown > ol > li > ul");

  await expect(firstParagraph).toHaveCSS("display", "inline");
  await expect(firstParagraph).toHaveCSS("margin-top", "0px");
  await expect(firstParagraph).toHaveCSS("margin-bottom", "0px");
  await expect(nestedList).toHaveCSS("margin-top", "5.6px");
  await expect(nestedList).toHaveCSS("margin-bottom", "5.6px");
});
```

- [ ] **Step 4: Run the browser test and verify the expected failure**

Run:

```bash
npm run test:e2e -- tests/e2e/markdown-list-layout.spec.ts
```

Expected: FAIL on `display`, reporting `block` instead of `inline`. If an old development server is already running, stop it and rerun so Playwright uses the current workspace build.

- [ ] **Step 5: Add the minimal list-child CSS**

Insert these rules after the base `.board-markdown ul, .board-markdown ol` rule and before the centered-list rules in `src/app/globals.css`:

```css
.board-markdown li > p:first-child {
  display: inline;
  margin: 0;
}

.board-markdown li > ul,
.board-markdown li > ol {
  margin-block: 0.35rem;
}
```

Do not change `list-style-position: inside`; the inline first paragraph lets the inside marker and text share the centered line. Do not target later paragraph children.

- [ ] **Step 6: Run focused tests and verify green**

Run:

```bash
npm run test:run -- src/features/boards/markdown/board-markdown.test.tsx
npm run test:e2e -- tests/e2e/markdown-list-layout.spec.ts
```

Expected: both commands PASS. The browser assertions resolve `0.35rem` to `5.6px` at Chromium's default `16px` root font size.

- [ ] **Step 7: Run the full verification suite**

Run:

```bash
npm run verify
npm audit --audit-level=high
```

Expected: lint, typecheck, all Vitest tests, production build, client-secret scan, and the high-severity dependency audit all PASS with no new warnings.

- [ ] **Step 8: Review the final diff and commit**

Run:

```bash
git diff --check
git diff -- src/app/globals.css src/features/boards/markdown/board-markdown.test.tsx tests/e2e/markdown-list-layout.spec.ts
git add src/app/globals.css src/features/boards/markdown/board-markdown.test.tsx tests/e2e/markdown-list-layout.spec.ts
git diff --cached --check
git commit -m "fix: compact centered Markdown lists"
```

Expected: only the three planned files are included in the implementation commit, and the commit succeeds.
