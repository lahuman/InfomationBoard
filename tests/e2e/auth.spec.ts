import { expect, test } from "@playwright/test";

test("login page exposes both approved authentication methods", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByLabel("이메일")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "매직링크 받기" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Google로 계속하기" }),
  ).toBeVisible();
});

test("dashboard redirects anonymous visitors to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  await expect(page.getByLabel("이메일")).toBeVisible();
});
