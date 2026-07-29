import { expect, test } from "@playwright/test";

test("landing page introduces the beta and primary action", async ({ page }) => {
  const response = await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: /한 번 만들고/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "무료로 안내판 만들기" }),
  ).toHaveAttribute("href", "/login");
  await expect(page.getByText("무료 베타")).toBeVisible();
  expect(response?.headers()["content-security-policy"]).toContain("nonce-");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
});

test("visitor opens a complete sample board from the landing page", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /행사 안내 샘플 보드 보기/ })
    .click();

  await expect(page).toHaveURL(/\/examples\/summer-festival$/);
  await expect(page.getByText("활용 예시 · 행사 안내")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "한강 여름 음악 축제" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "프로그램" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "내 안내판 만들기" }),
  ).toHaveAttribute("href", "/login");
  await expect(
    page.getByRole("link", { name: "다른 예시 보기" }),
  ).toHaveAttribute("href", "/#examples");
});

test("landing page remains usable without horizontal overflow on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: /한 번 만들고/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "무료로 안내판 만들기" }),
  ).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page
    .getByRole("link", { name: /모임 안내 샘플 보드 보기/ })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "퇴근 후 한 장 독서모임" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
});
