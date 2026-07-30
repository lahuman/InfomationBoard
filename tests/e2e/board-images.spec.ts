import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const ownerStorageState =
  process.env.E2E_OWNER_STORAGE_STATE ??
  (process.env.E2E_LIVE_SUPABASE === "1"
    ? path.join(process.cwd(), ".playwright/.auth/owner.json")
    : undefined);

const pngFixture = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const fixtureName = "e2e-poster.png";

async function createBoard(page: Page, title: string) {
  await page.goto("/boards/new");
  await page.getByLabel("행사 안내").check();
  await page.getByRole("button", { name: "안내판 만들기" }).click();
  await expect(page).toHaveURL(/\/boards\/[^/]+\/edit$/);
  await page.getByLabel("제목").fill(title);
  await page.getByRole("tab", { name: "Markdown 원문" }).click();
  await page.getByLabel("본문 Markdown 원문").fill("## 이미지 안내");
  await expect(page.locator(".save-state")).toHaveText("저장됨", {
    timeout: 10_000,
  });
}

async function deleteBoardIfPresent(page: Page, editorUrl: string) {
  await page.goto(editorUrl);
  const deleteButton = page.getByRole("button", { name: "안내판 삭제" });
  if ((await deleteButton.count()) === 0) return;
  await deleteButton.click();
  await page.getByRole("button", { name: "영구 삭제" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("board image upload, insertion, access, and deletion", () => {
  test.skip(
    !ownerStorageState,
    "Set E2E_OWNER_STORAGE_STATE to an authenticated Playwright storage-state file.",
  );
  test.use({ storageState: ownerStorageState });

  test("persists an inserted image and enforces public, private, and password delivery", async ({
    browser,
    page,
  }) => {
    const title = `이미지 E2E ${Date.now()}`;
    await createBoard(page, title);
    const editorUrl = page.url();
    const anonymous = await browser.newContext();

    try {
      await page.getByRole("button", { name: "이미지" }).click();
      await page.getByLabel("이미지 추가").setInputFiles({
        name: fixtureName,
        mimeType: "image/png",
        buffer: pngFixture,
      });
      await expect(page.getByText("업로드 완료", { exact: true })).toBeVisible();
      await expect(page.locator(".image-library-usage")).toHaveText(
        `${pngFixture.byteLength} B / 50 MB`,
      );

      await page
        .getByLabel(`${fixtureName} 대체 텍스트`)
        .fill("E2E poster");
      await page.getByRole("button", { name: `${fixtureName} 삽입` }).click();
      const editorPreview = page.locator(".editor-preview-panel");
      await expect(
        editorPreview.getByRole("img", { name: "E2E poster" }),
      ).toBeVisible();
      await expect(page.locator(".save-state")).toHaveText("저장됨", {
        timeout: 10_000,
      });

      const imagePath = await page
        .locator(".editor-preview-panel")
        .getByRole("img", { name: "E2E poster" })
        .getAttribute("src");
      const canonicalUrl = await page
        .locator(".publication-url a")
        .getAttribute("href");
      expect(imagePath).toMatch(
        /^\/b\/[a-z0-9]+(?:-[a-z0-9]+)*\/images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(canonicalUrl).toBeTruthy();
      const imageUrl = new URL(imagePath!, canonicalUrl!).toString();

      await page.reload();
      await expect(
        page
          .locator(".editor-preview-panel")
          .getByRole("img", { name: "E2E poster" }),
      ).toBeVisible();

      await page.getByRole("radio", { name: /^전체 공개/ }).check();
      await page.getByRole("button", { name: "게시 설정 저장" }).click();
      await expect(page.getByText("게시 설정을 저장했습니다.")).toBeVisible();

      const visitor = await anonymous.newPage();
      await visitor.goto(canonicalUrl!);
      await expect(visitor.getByRole("img", { name: "E2E poster" })).toBeVisible();
      expect((await visitor.request.get(imageUrl)).status()).toBe(200);

      await page.getByRole("radio", { name: /^비공개 초안/ }).check();
      await page.getByRole("button", { name: "게시 설정 저장" }).click();
      await page.getByRole("button", { name: "공개 중단" }).click();
      await expect(page.getByText("게시 설정을 저장했습니다.")).toBeVisible();
      expect((await visitor.request.get(imageUrl)).status()).toBe(404);

      await page.getByRole("radio", { name: /^비밀번호 보호/ }).check();
      await page
        .getByRole("textbox", { name: /^방문 비밀번호/ })
        .fill("image-password");
      await page.getByRole("button", { name: "게시 설정 저장" }).click();
      await expect(page.getByText("게시 설정을 저장했습니다.")).toBeVisible();

      expect((await visitor.request.get(imageUrl)).status()).toBe(404);
      await visitor.goto(canonicalUrl!);
      await visitor.getByLabel("안내판 비밀번호").fill("image-password");
      await visitor.getByRole("button", { name: "안내판 열기" }).click();
      await expect(visitor.getByRole("heading", { name: title })).toBeVisible();
      expect((await visitor.request.get(imageUrl)).status()).toBe(200);

      await page.getByRole("tab", { name: "Markdown 원문" }).click();
      await page
        .getByLabel("본문 Markdown 원문")
        .fill("## 이미지 안내\n\n이미지를 제거했습니다.");
      await expect(page.locator(".save-state")).toHaveText("저장됨", {
        timeout: 10_000,
      });

      const imageToggle = page.getByRole("button", { name: "이미지" });
      if ((await imageToggle.getAttribute("aria-expanded")) !== "true") {
        await imageToggle.click();
      }
      await page.getByRole("button", { name: `${fixtureName} 삭제` }).click();
      await page
        .getByRole("button", { name: `${fixtureName} 삭제 확인` })
        .click();
      await expect(page.getByText("이미지를 삭제했습니다.")).toBeVisible();
      await expect(page.locator(".image-library-usage")).toHaveText(
        "0 B / 50 MB",
      );
      expect((await visitor.request.get(imageUrl)).status()).toBe(404);

      await anonymous.close();
      await deleteBoardIfPresent(page, editorUrl);
    } finally {
      await anonymous.close().catch(() => undefined);
      await deleteBoardIfPresent(page, editorUrl).catch(() => undefined);
    }
  });
});
