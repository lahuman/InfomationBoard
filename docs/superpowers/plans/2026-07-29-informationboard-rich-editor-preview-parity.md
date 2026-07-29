# Rich Editor and Preview Style Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every supported Markdown format visibly formatted in the Milkdown/ProseMirror rich editor with presentation corresponding to the existing owner preview.

**Architecture:** Keep Markdown parsing, serialization, sanitization, and preview rendering unchanged. Verify the browser-visible contract with a standalone Playwright fixture, then add editor-scoped CSS counterparts under `.markdown-rich-surface .ProseMirror` so styles cannot leak into previews or other pages.

**Tech Stack:** Next.js 16, React 19, Milkdown 7/ProseMirror, Tailwind CSS 4, Playwright 1.62, CSS

## Global Constraints

- Do not change the persisted Markdown contract or either renderer.
- Do not add dependencies.
- Keep the editor background, sizing, padding, caret, selection, focus, toolbar, and help footer unchanged.
- Keep board title, summary, palette, density, and alignment presentation preview-only.
- Scope every new presentation rule beneath `.markdown-rich-surface .ProseMirror`.
- Preserve the current owner preview and public board appearance.

---

## File Structure

- Create `tests/e2e/rich-editor-style-parity.spec.ts`: exercise representative ProseMirror markup against the real global stylesheet and assert computed browser styles.
- Modify `src/app/globals.css`: provide editor-scoped heading, link, list, blockquote, divider, code, and table presentation.

### Task 1: Rich Editor Markdown Presentation

**Files:**
- Create: `tests/e2e/rich-editor-style-parity.spec.ts`
- Modify: `src/app/globals.css:118-148`

**Interfaces:**
- Consumes: semantic HTML emitted by Milkdown inside `.markdown-rich-surface .ProseMirror`; existing application variables `--foreground`, `--accent`, and `--line`.
- Produces: a browser-visible CSS contract for headings, links, lists, blockquotes, horizontal rules, inline and block code, and tables. No TypeScript interface changes.

- [ ] **Step 1: Write the failing browser behavior test**

Create `tests/e2e/rich-editor-style-parity.spec.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("visually formats supported Markdown inside the rich editor", async ({
  page,
}) => {
  await page.setContent(`
    <section class="markdown-rich-surface" style="width: 640px">
      <div class="ProseMirror">
        <h2>일정</h2>
        <h3>세부 안내</h3>
        <p><a href="/guide">안내 링크</a>와 <code>inline</code></p>
        <ul><li>글머리 항목</li></ul>
        <ol><li>번호 항목</li></ol>
        <blockquote><p>중요 안내</p></blockquote>
        <hr>
        <pre><code>const open = true;</code></pre>
        <table><tbody><tr><td>상태</td><td>완료</td></tr></tbody></table>
      </div>
    </section>
  `);
  await page.addStyleTag({
    content: await readFile(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    ),
  });

  const editor = page.locator(".markdown-rich-surface .ProseMirror");
  await expect(editor.locator("h2")).toHaveCSS("font-size", "32px");
  await expect(editor.locator("h3")).toHaveCSS("font-size", "23.2px");
  await expect(editor.locator("a")).toHaveCSS("font-weight", "800");
  await expect(editor.locator("ul")).toHaveCSS("list-style-type", "disc");
  await expect(editor.locator("ol")).toHaveCSS("list-style-type", "decimal");
  await expect(editor.locator("blockquote")).toHaveCSS(
    "border-left-width",
    "5.6px",
  );
  await expect(editor.locator("hr")).toHaveCSS("border-top-width", "1px");
  await expect(editor.locator("pre")).toHaveCSS("padding-top", "16px");
  await expect(editor.locator("table")).toHaveCSS("width", "640px");
  await expect(editor.locator("td").first()).toHaveCSS(
    "border-top-width",
    "1px",
  );
});
```

The production change this test catches is removal or failure to scope any rich-editor presentation rule, which would return one or more semantic elements to plain browser/Tailwind-reset presentation.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm run test:e2e -- tests/e2e/rich-editor-style-parity.spec.ts
```

Expected: FAIL first on the `h2` computed font size because the current rich editor has no heading presentation rule. Confirm the test fixture loads and the failure is an assertion failure, not a build or environment error.

- [ ] **Step 3: Add the minimal editor-scoped styles**

In `src/app/globals.css`, extend the existing rich-surface block with these scoped counterparts:

```css
.markdown-rich-surface {
  --preview-accent: var(--accent);
  min-height: 20rem;
  padding: 0;
}

.markdown-rich-surface .ProseMirror > :first-child {
  margin-top: 0;
}

.markdown-rich-surface .ProseMirror h1,
.markdown-rich-surface .ProseMirror h2,
.markdown-rich-surface .ProseMirror h3,
.markdown-rich-surface .ProseMirror h4 {
  margin: 2rem 0 0.75rem;
  line-height: 1.15;
}

.markdown-rich-surface .ProseMirror h2 {
  margin: 2.4rem 0 0.8rem;
  font-size: clamp(1.45rem, 3vw, 2rem);
}

.markdown-rich-surface .ProseMirror h3 {
  margin: 1.8rem 0 0.65rem;
  font-size: clamp(1.15rem, 2.2vw, 1.45rem);
}

.markdown-rich-surface .ProseMirror a {
  color: color-mix(in srgb, var(--preview-accent) 75%, #000);
  font-weight: 800;
  text-underline-offset: 0.2rem;
}

.markdown-rich-surface .ProseMirror ul,
.markdown-rich-surface .ProseMirror ol {
  margin: 0.75rem 0 1.25rem;
  padding-inline-start: 1.5rem;
}

.markdown-rich-surface .ProseMirror li + li {
  margin-top: 0.35rem;
}

.markdown-rich-surface .ProseMirror hr {
  margin: 2.5rem 0;
  border: 0;
  border-top: 1px solid var(--foreground);
}

.markdown-rich-surface .ProseMirror blockquote {
  margin-inline: 0;
  padding-left: 1rem;
  border-left: 0.35rem solid var(--preview-accent);
}

.markdown-rich-surface .ProseMirror pre,
.markdown-rich-surface .ProseMirror code {
  background: color-mix(in srgb, var(--foreground) 8%, transparent);
}

.markdown-rich-surface .ProseMirror pre {
  padding: 1rem;
  overflow-x: auto;
  text-align: left;
}

.markdown-rich-surface .ProseMirror table {
  width: 100%;
  border-collapse: collapse;
}

.markdown-rich-surface .ProseMirror th,
.markdown-rich-surface .ProseMirror td {
  padding: 0.6rem;
  border: 1px solid var(--foreground);
}
```

Keep the existing explicit `disc` and `decimal` rules directly after the shared list spacing block.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm run test:e2e -- tests/e2e/rich-editor-style-parity.spec.ts
```

Expected: PASS. The fixed-width fixture makes the table's `width: 100%` result deterministic.

- [ ] **Step 5: Run focused renderer and editor regressions**

Run:

```bash
npm run test:run -- src/features/boards/editor/markdown-editor/milkdown-editor.test.ts src/features/boards/editor/markdown-editor/markdown-content-editor.test.tsx src/features/boards/markdown/board-markdown.test.tsx
```

Expected: all focused Vitest files PASS, confirming Markdown parsing, serialization, toolbar behavior, and preview rendering remain unchanged.

- [ ] **Step 6: Run repository verification**

Run:

```bash
npm run verify
```

Expected: lint, typecheck, Vitest, production build, and client-secret security check all PASS.

Then run:

```bash
npm run test:e2e
```

Expected: unauthenticated Playwright coverage and the new rich-editor computed-style regression PASS; live owner tests may skip when `E2E_OWNER_STORAGE_STATE` is not configured.

- [ ] **Step 7: Commit the implementation**

```bash
git add src/app/globals.css tests/e2e/rich-editor-style-parity.spec.ts
git commit -m "fix: match rich editor to Markdown preview"
```
