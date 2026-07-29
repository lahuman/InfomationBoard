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
