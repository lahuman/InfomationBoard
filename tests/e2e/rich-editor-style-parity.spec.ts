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
    "5px",
  );
  await expect(editor.locator("hr")).toHaveCSS("border-top-width", "1px");
  await expect(editor.locator("pre")).toHaveCSS("padding-top", "16px");
  await expect(editor.locator("table")).toHaveCSS("width", "640px");
  await expect(editor.locator("td").first()).toHaveCSS(
    "border-top-width",
    "1px",
  );
});
