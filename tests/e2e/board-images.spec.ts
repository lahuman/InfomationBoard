import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import path from "node:path";
import { runE2EScenarioWithCleanup } from "./support/cleanup";
import { resolvePlaywrightE2EEnvironment } from "./support/e2e-configuration";
import { parseExactStorageMeterBytes } from "./support/image-meter";

const { ownerStorageState } = resolvePlaywrightE2EEnvironment(
  process.env,
  path.join(process.cwd(), ".playwright/.auth/owner.json"),
);

const pngFixture = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const fixtureName = "e2e-poster.png";

async function createBoard(
  page: Page,
  title: string,
  onCreated: (editorUrl: string) => void,
) {
  await page.goto("/boards/new");
  await page.getByLabel("행사 안내").check();
  await page.getByRole("button", { name: "안내판 만들기" }).click();
  await expect(page).toHaveURL(/\/boards\/[^/]+\/edit$/);
  onCreated(page.url());
  await page.getByLabel("제목").fill(title);
  await page.getByRole("tab", { name: "Markdown 원문" }).click();
  await page.getByLabel("본문 Markdown 원문").fill("## 이미지 안내");
  await expect(page.locator(".save-state")).toHaveText("저장됨", {
    timeout: 10_000,
  });
}

async function readExactStorageMeterBytes(meter: Locator) {
  return parseExactStorageMeterBytes(await meter.getAttribute("value"));
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
    let editorUrl: string | null = null;
    let anonymous: BrowserContext | null = null;

    await runE2EScenarioWithCleanup(
      async () => {
        await createBoard(page, title, (createdEditorUrl) => {
          editorUrl = createdEditorUrl;
        });
        anonymous = await browser.newContext();

        await page.getByRole("button", { name: "이미지" }).click();
        await expect(
          page.getByRole("dialog", { name: "이미지 관리" }),
        ).toBeVisible();
        const usageMeter = page.locator(
          'meter[aria-label="이미지 저장공간 사용량"]',
        );
        const baselineStorageBytes =
          await readExactStorageMeterBytes(usageMeter);
        await page.getByLabel("이미지 추가").setInputFiles({
          name: fixtureName,
          mimeType: "image/png",
          buffer: pngFixture,
        });
        await expect(
          page.getByText("업로드 완료", { exact: true }),
        ).toBeVisible();
        await expect
          .poll(() => readExactStorageMeterBytes(usageMeter))
          .toBe(baselineStorageBytes + pngFixture.byteLength);

        await page
          .getByLabel(`${fixtureName} 대체 텍스트`)
          .fill("E2E poster");
        await page
          .getByRole("radio", { name: "본문 너비의 50%" })
          .check();
        await page.getByRole("button", { name: `${fixtureName} 삽입` }).click();
        const editorPreview = page.locator(".editor-preview-panel");
        const insertedPreviewImage = editorPreview.getByRole("img", {
          name: "E2E poster",
        });
        await expect(insertedPreviewImage).toBeVisible();
        await expect(insertedPreviewImage).toHaveClass(
          "board-image-width-50",
        );
        await expect(page.locator(".save-state")).toHaveText("저장됨", {
          timeout: 10_000,
        });

        const imagePath = await insertedPreviewImage.getAttribute("src");
        const canonicalUrl = await page
          .locator(".publication-url a")
          .getAttribute("href");
        expect(imagePath).toMatch(
          /^\/b\/[a-z0-9]+(?:-[a-z0-9]+)*\/images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        expect(canonicalUrl).toBeTruthy();
        const imageUrl = new URL(imagePath!, canonicalUrl!).toString();

        await page.reload();
        await page.getByRole("tab", { name: "리치 텍스트" }).click();
        const richEditorImage = page
          .getByRole("tabpanel", { name: "리치 텍스트" })
          .locator(".ProseMirror")
          .getByRole("img", { name: "E2E poster" });
        await expect(richEditorImage).toBeVisible();
        await richEditorImage.click();
        await expect(richEditorImage).toHaveClass(/ProseMirror-selectednode/);

        await page.getByRole("button", { name: "이미지" }).click();
        await expect(
          page.getByRole("dialog", { name: "이미지 관리" }),
        ).toBeVisible();
        await page
          .getByLabel(`${fixtureName} 대체 텍스트`)
          .fill("E2E resized poster");
        await page
          .getByRole("radio", { name: "본문 너비의 25%" })
          .check();
        await page.getByRole("button", { name: "이미지 수정" }).click();
        const resizedPreviewImage = editorPreview.getByRole("img", {
          name: "E2E resized poster",
        });
        await expect(resizedPreviewImage).toBeVisible();
        await expect(resizedPreviewImage).toHaveClass(
          "board-image-width-25",
        );
        await expect(page.locator(".save-state")).toHaveText("저장됨", {
          timeout: 10_000,
        });

        await page.getByRole("radio", { name: /^전체 공개/ }).check();
        await page.getByRole("button", { name: "게시 설정 저장" }).click();
        await expect(page.getByText("게시 설정을 저장했습니다.")).toBeVisible();

        const visitor = await anonymous.newPage();
        await visitor.goto(canonicalUrl!);
        const visitorImage = visitor.getByRole("img", {
          name: "E2E resized poster",
        });
        await expect(visitorImage).toBeVisible();
        await expect(visitorImage).toHaveClass("board-image-width-25");
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
        await expect(
          visitor.getByRole("heading", { name: title }),
        ).toBeVisible();
        expect((await visitor.request.get(imageUrl)).status()).toBe(200);

        await page.getByRole("tab", { name: "Markdown 원문" }).click();
        await page
          .getByLabel("본문 Markdown 원문")
          .fill("## 이미지 안내\n\n이미지를 제거했습니다.");
        await expect(page.locator(".save-state")).toHaveText("저장됨", {
          timeout: 10_000,
        });

        await page.getByRole("button", { name: "이미지" }).click();
        await expect(
          page.getByRole("dialog", { name: "이미지 관리" }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: `${fixtureName} 삭제` })
          .click();
        await expect(
          page.getByRole("dialog", { name: "이미지 관리" }),
        ).toHaveCount(0);
        const deleteDialog = page.getByRole("dialog", {
          name: "이미지 삭제",
        });
        await expect(deleteDialog).toHaveCount(1);
        await expect(deleteDialog).toBeVisible();
        await deleteDialog
          .getByRole("button", { name: `${fixtureName} 삭제 확인` })
          .click();
        await expect(page.getByText("이미지를 삭제했습니다.")).toBeVisible();
        await expect
          .poll(() => readExactStorageMeterBytes(usageMeter))
          .toBe(baselineStorageBytes);
        expect((await visitor.request.get(imageUrl)).status()).toBe(404);
      },
      [
        async () => {
          if (anonymous) await anonymous.close();
        },
        async () => {
          if (editorUrl) await deleteBoardIfPresent(page, editorUrl);
        },
      ],
    );
  });
});
