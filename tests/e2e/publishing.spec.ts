import { expect, test } from "@playwright/test";
import path from "node:path";

const ownerStorageState =
  process.env.E2E_OWNER_STORAGE_STATE ??
  (process.env.E2E_LIVE_SUPABASE === "1"
    ? path.join(process.cwd(), ".playwright/.auth/owner.json")
    : undefined);

async function createBoard(page: import("@playwright/test").Page, title: string) {
  await page.goto("/boards/new");
  await page.getByLabel("행사 안내").check();
  await page.getByRole("button", { name: "안내판 만들기" }).click();
  await expect(page).toHaveURL(/\/boards\/[^/]+\/edit$/);
  await page.getByLabel("제목").fill(title);
  await page.getByLabel("본문 Markdown").fill("## 운영 시간\n\n금요일 오후 6시");
  await expect(page.getByRole("status").first()).toHaveText("저장됨", {
    timeout: 10_000,
  });
}

async function deleteBoard(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "안내판 삭제" }).click();
  await page.getByRole("button", { name: "영구 삭제" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("publishing, protected access, and QR", () => {
  test.skip(
    !ownerStorageState,
    "Set E2E_OWNER_STORAGE_STATE to an authenticated Playwright storage-state file.",
  );
  test.use({ storageState: ownerStorageState });

  test("publishes at a stable URL, updates, downloads QR, and withdraws", async ({
    browser,
    page,
  }) => {
    const title = `공개 E2E ${Date.now()}`;
    await createBoard(page, title);
    const canonicalLink = page.locator(".publication-url a");
    const canonicalUrl = await canonicalLink.getAttribute("href");
    expect(canonicalUrl).toBeTruthy();

    await page.getByRole("radio", { name: /^전체 공개/ }).check();
    await page.getByRole("button", { name: "게시 설정 저장" }).click();
    await expect(page.getByText("게시 설정을 저장했습니다.")).toBeVisible();
    await expect(page.getByRole("img", { name: "안내판 QR 미리보기" })).toBeVisible();

    const anonymous = await browser.newContext();
    const visitor = await anonymous.newPage();
    await visitor.goto(canonicalUrl!);
    await expect(visitor.getByRole("heading", { name: title })).toBeVisible();

    const png = await visitor.request.get(`${canonicalUrl}/qr.png`);
    expect(png.status()).toBe(200);
    expect(png.headers()["content-type"]).toBe("image/png");
    expect((await png.body()).subarray(0, 8).toString("hex")).toBe(
      "89504e470d0a1a0a",
    );
    const svg = await visitor.request.get(`${canonicalUrl}/qr.svg`);
    expect(svg.status()).toBe(200);
    expect(svg.headers()["content-type"]).toContain("image/svg+xml");
    expect(await svg.text()).toContain("<svg");

    const updatedTitle = `${title} 수정`;
    await page.getByLabel("제목").fill(updatedTitle);
    await expect(page.getByRole("status").first()).toHaveText("저장됨", {
      timeout: 10_000,
    });
    await expect(canonicalLink).toHaveAttribute("href", canonicalUrl!);
    await visitor.reload();
    await expect(
      visitor.getByRole("heading", { name: updatedTitle }),
    ).toBeVisible();

    await page.getByRole("radio", { name: /^비공개 초안/ }).check();
    await page.getByRole("button", { name: "게시 설정 저장" }).click();
    await page.getByRole("button", { name: "공개 중단" }).click();
    await expect(page.getByText("게시 설정을 저장했습니다.")).toBeVisible();
    expect((await visitor.goto(canonicalUrl!))?.status()).toBe(404);
    expect((await visitor.request.get(`${canonicalUrl}/qr.png`)).status()).toBe(
      404,
    );

    await anonymous.close();
    await deleteBoard(page);
  });

  test("unlocks a password board, invalidates old access, and locks five failures", async ({
    browser,
    page,
  }) => {
    const title = `보호 E2E ${Date.now()}`;
    await createBoard(page, title);
    const canonicalUrl = await page.locator(".publication-url a").getAttribute("href");
    expect(canonicalUrl).toBeTruthy();

    await page.getByRole("radio", { name: /^비밀번호 보호/ }).check();
    await page
      .getByRole("textbox", { name: /^방문 비밀번호/ })
      .fill("first-password");
    await page.getByRole("button", { name: "게시 설정 저장" }).click();
    await expect(page.getByText("게시 설정을 저장했습니다.")).toBeVisible();

    const anonymous = await browser.newContext();
    const visitor = await anonymous.newPage();
    await visitor.goto(canonicalUrl!);
    await visitor.getByLabel("안내판 비밀번호").fill("first-password");
    await visitor.getByRole("button", { name: "안내판 열기" }).click();
    await expect(visitor.getByRole("heading", { name: title })).toBeVisible();

    await page
      .getByRole("textbox", { name: /^방문 비밀번호/ })
      .fill("second-password");
    await page.getByRole("button", { name: "게시 설정 저장" }).click();
    await expect(page.getByText("게시 설정을 저장했습니다.")).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByLabel("안내판 비밀번호")).toBeVisible();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await visitor.getByLabel("안내판 비밀번호").fill("wrong-password");
      const submit = visitor.getByRole("button", { name: "안내판 열기" });
      const verificationResponse = visitor.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === new URL(canonicalUrl!).pathname,
      );
      await submit.click();
      await verificationResponse;
      await expect(visitor.locator(".password-challenge-message")).toHaveText(
        attempt === 5
          ? "잠시 후 다시 시도해 주세요."
          : "비밀번호를 확인해 주세요.",
      );
    }
    await expect(visitor.locator(".password-challenge-message")).toHaveText(
      "잠시 후 다시 시도해 주세요.",
    );

    expect((await visitor.request.get(`${canonicalUrl}/qr.svg`)).status()).toBe(
      200,
    );
    await anonymous.close();
    await deleteBoard(page);
  });
});
