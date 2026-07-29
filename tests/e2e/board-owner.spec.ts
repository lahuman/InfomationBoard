import { expect, test } from "@playwright/test";

const ownerStorageState = process.env.E2E_OWNER_STORAGE_STATE;

test.describe("authenticated board owner workflow", () => {
  test.skip(
    !ownerStorageState,
    "Set E2E_OWNER_STORAGE_STATE to an authenticated Playwright storage-state file.",
  );

  test.use({ storageState: ownerStorageState });

  test("creates, edits Markdown, previews, autosaves, reopens, and deletes a private draft", async ({
    page,
  }) => {
    const uniqueTitle = `E2E 안내판 ${Date.now()}`;

    await page.goto("/boards/new");
    await page.getByLabel("행사 안내").check();
    await page.getByRole("button", { name: "안내판 만들기" }).click();
    await expect(page).toHaveURL(/\/boards\/[^/]+\/edit$/);

    await page.getByLabel("제목").fill(uniqueTitle);
    await expect(page.getByRole("status")).toHaveText("저장됨", {
      timeout: 10_000,
    });

    await page.getByRole("tab", { name: "Markdown 원문" }).click();
    await page.getByLabel("요약").fill("첫째 줄\n둘째 줄");
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
    await expect(
      preview.getByRole("heading", { name: "일정", level: 2 }),
    ).toBeVisible();
    await expect(preview.getByRole("list")).toHaveCount(2);
    await expect(preview.locator(".board-markdown hr")).toHaveCount(1);
    await expect(page.locator(".preview-summary")).toHaveCSS(
      "white-space",
      "pre-wrap",
    );

    await page.setViewportSize({ width: 375, height: 900 });
    const editorPanel = page.locator(".editor-form-panel");
    const toolbar = editorPanel.locator(".markdown-toolbar");
    const [toolbarBox, editorPanelBox] = await Promise.all([
      toolbar.boundingBox(),
      editorPanel.boundingBox(),
    ]);
    expect(toolbarBox).not.toBeNull();
    expect(editorPanelBox).not.toBeNull();
    expect(toolbarBox!.x + toolbarBox!.width).toBeLessThanOrEqual(
      editorPanelBox!.x + editorPanelBox!.width,
    );

    await page.reload();
    await expect(page.getByLabel("제목")).toHaveValue(uniqueTitle);

    await page.getByRole("button", { name: "안내판 삭제" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "영구 삭제" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: uniqueTitle }),
    ).not.toBeVisible();
  });
});
