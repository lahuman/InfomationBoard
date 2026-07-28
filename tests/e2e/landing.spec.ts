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
});
