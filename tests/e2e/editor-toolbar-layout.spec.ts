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
