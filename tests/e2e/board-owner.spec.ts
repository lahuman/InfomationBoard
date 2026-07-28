import { expect, test } from "@playwright/test";

const ownerStorageState = process.env.E2E_OWNER_STORAGE_STATE;

test.describe("authenticated board owner workflow", () => {
  test.skip(
    !ownerStorageState,
    "Set E2E_OWNER_STORAGE_STATE to an authenticated Playwright storage-state file.",
  );

  test.use({ storageState: ownerStorageState });

  test("creates, autosaves, reopens, and deletes a private draft", async ({
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
