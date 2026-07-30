import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageEditorBridge } from "../editor/markdown-editor/types";
import type { CancelBoardImageResult } from "./actions/cancel-image";
import type { DeleteBoardImageResult } from "./actions/delete-image";
import type { FinalizeBoardImageResult } from "./actions/finalize-image";
import type { ReserveBoardImageResult } from "./actions/reserve-image";
import { ImageLibrary, type ImageLibraryProps } from "./image-library";
import type { BoardImage, BoardImageLibrary } from "./model";
import type { UploadBoardImageResult } from "./upload-image";

vi.mock("server-only", () => ({}));

const boardId = "20000000-0000-4000-8000-000000000002";
const boardSlug = "summer-market";
const firstImage: BoardImage = {
  id: "30000000-0000-4000-8000-000000000003",
  originalFilename: "poster.png",
  mimeType: "image/png",
  sizeBytes: 768 * 1_024,
  url: "/b/summer-market/images/30000000-0000-4000-8000-000000000003",
};
const secondImage: BoardImage = {
  id: "40000000-0000-4000-8000-000000000004",
  originalFilename: "map.webp",
  mimeType: "image/webp",
  sizeBytes: 256 * 1_024,
  url: "/b/summer-market/images/40000000-0000-4000-8000-000000000004",
};

const reserveImageAction = vi.fn<
  (input: {
    boardId: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
  }) => Promise<ReserveBoardImageResult>
>();
const finalizeImageAction = vi.fn<
  (input: { boardId: string; attachmentId: string }) => Promise<FinalizeBoardImageResult>
>();
const cancelImageAction = vi.fn<
  (input: { boardId: string; attachmentId: string }) => Promise<CancelBoardImageResult>
>();
const deleteImageAction = vi.fn<
  (input: { boardId: string; attachmentId: string }) => Promise<DeleteBoardImageResult>
>();
const applyImage = vi.fn<ImageEditorBridge["applyImage"]>();
const closeImageLibrary = vi.fn();
const onBoardRevision = vi.fn<(revision: number) => void>();

function renderLibrary(
  options: {
    bridge?: ImageEditorBridge;
    contentMarkdown?: string;
    initialLibrary?: BoardImageLibrary;
    onOuterEscape?: () => void;
    strict?: boolean;
    uploadImage?: ImageLibraryProps["uploadImage"];
  } = {},
) {
  const library = (
    <ImageLibrary
      boardId={boardId}
      boardSlug={boardSlug}
      bridge={
        options.bridge ?? {
          open: true,
          selectedImage: null,
          applyImage,
          close: closeImageLibrary,
        }
      }
      cancelImageAction={cancelImageAction}
      contentMarkdown={options.contentMarkdown ?? "# 안내"}
      deleteImageAction={deleteImageAction}
      finalizeImageAction={finalizeImageAction}
      initialLibrary={
        options.initialLibrary ?? {
          images: [firstImage, secondImage],
          storageBytes: 1_048_576,
        }
      }
      onBoardRevision={onBoardRevision}
      reserveImageAction={reserveImageAction}
      uploadImage={options.uploadImage}
    />
  );
  const maybeStrict = options.strict ? (
    <StrictMode>{library}</StrictMode>
  ) : (
    library
  );
  return render(
    options.onOuterEscape ? (
      <div
        onKeyDown={(event) => {
          if (event.key === "Escape") options.onOuterEscape?.();
        }}
      >
        {maybeStrict}
      </div>
    ) : (
      maybeStrict
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  applyImage.mockReturnValue(true);
  reserveImageAction.mockResolvedValue({
    status: "error",
    code: "unavailable",
    message: "이미지 업로드를 준비하지 못했습니다.",
  });
  finalizeImageAction.mockResolvedValue({
    status: "error",
    code: "unavailable",
    message: "이미지 업로드를 완료하지 못했습니다.",
  });
  cancelImageAction.mockResolvedValue({ status: "cancelled" });
  deleteImageAction.mockResolvedValue({
    status: "error",
    message: "이미지를 삭제하지 못했습니다.",
  });
});

describe("ImageLibrary", () => {
  it("captures an uploaded alt value before React defers the state updater", async () => {
    const user = userEvent.setup();
    let resolveUpload: ((result: UploadBoardImageResult) => void) | undefined;
    const uploadResult = new Promise<UploadBoardImageResult>((resolve) => {
      resolveUpload = resolve;
    });
    const uploadedImage: BoardImage = {
      id: "50000000-0000-4000-8000-000000000005",
      originalFilename: "new.gif",
      mimeType: "image/gif",
      sizeBytes: 4,
      url: "/b/summer-market/images/50000000-0000-4000-8000-000000000005",
    };
    const reportedErrors: unknown[] = [];
    const handleWindowError = (event: ErrorEvent) => {
      reportedErrors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener("error", handleWindowError);
    renderLibrary({
      initialLibrary: { images: [], storageBytes: 0 },
      strict: true,
      uploadImage: vi.fn(() => uploadResult),
    });
    const file = new File([new Uint8Array([1, 2, 3, 4])], "new.gif", {
      type: "image/gif",
    });

    let escapedError: unknown;
    try {
      await user.upload(screen.getByLabelText("이미지 추가"), file);
      await act(async () => {
        resolveUpload?.({
          status: "ready",
          image: uploadedImage,
          storageBytes: 4,
        });
        await uploadResult;
      });
      const alt = screen.getByLabelText("new.gif 대체 텍스트");
      await user.clear(alt);
      await user.type(alt, "새 설명");
      expect(alt).toHaveValue("새 설명");
    } catch (error) {
      escapedError = error;
    } finally {
      window.removeEventListener("error", handleWindowError);
    }

    expect(escapedError).toBeUndefined();
    expect(reportedErrors).toEqual([]);
  });

  it("renders no dialog while the editor bridge is closed", () => {
    renderLibrary({
      bridge: {
        open: false,
        selectedImage: null,
        applyImage,
        close: closeImageLibrary,
      },
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("presents one image management dialog with quota and accessible controls", () => {
    const { container } = renderLibrary();

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "이미지 관리" })).toBeVisible();
    expect(screen.getByText("1 MB / 50 MB")).toBeVisible();
    expect(screen.getByText("남은 공간 49 MB")).toBeVisible();
    expect(screen.getByText("이미지당 최대 10 MB · 안내판당 최대 20개")).toBeVisible();
    expect(screen.getByText("poster.png")).toBeVisible();
    expect(screen.getByText("768 KB")).toBeVisible();
    expect(screen.getByLabelText("poster.png 대체 텍스트")).toHaveValue("poster");
    expect(screen.getByRole("checkbox", { name: "poster.png 장식용 이미지" })).not.toBeChecked();
    expect(
      screen
        .getByRole("checkbox", { name: "poster.png 장식용 이미지" })
        .closest("label"),
    ).toHaveClass("image-library-decorative-target");
    expect(screen.getByRole("button", { name: "poster.png 삽입" })).toBeVisible();
    expect(screen.getByRole("button", { name: "poster.png 삭제" })).toBeVisible();
    const thumbnail = container.querySelector(`img[src="${firstImage.url}"]`);
    expect(thumbnail).toHaveAttribute("alt", "");
  });

  it("initializes the matching selected image once without overwriting later field edits", async () => {
    const user = userEvent.setup();
    const bridge: ImageEditorBridge = {
      open: true,
      selectedImage: {
        src: firstImage.url,
        alt: "저장된 포스터 설명",
        width: 50,
      },
      applyImage,
      close: closeImageLibrary,
    };
    const rendered = renderLibrary({ bridge });

    const alt = screen.getByLabelText("poster.png 대체 텍스트");
    const size = screen.getByRole("group", {
      name: "poster.png 이미지 크기",
    });
    expect(alt).toHaveValue("저장된 포스터 설명");
    expect(
      within(size).getByRole("radio", { name: "본문 너비의 50%" }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "이미지 수정" }),
    ).toBeVisible();

    await user.clear(alt);
    await user.type(alt, "사용자가 바꾼 설명");
    await user.click(
      within(size).getByRole("radio", { name: "본문 너비의 75%" }),
    );
    rendered.rerender(
      <ImageLibrary
        boardId={boardId}
        boardSlug={boardSlug}
        bridge={bridge}
        cancelImageAction={cancelImageAction}
        contentMarkdown="# unrelated rerender"
        deleteImageAction={deleteImageAction}
        finalizeImageAction={finalizeImageAction}
        initialLibrary={{
          images: [firstImage, secondImage],
          storageBytes: 1_048_576,
        }}
        onBoardRevision={onBoardRevision}
        reserveImageAction={reserveImageAction}
      />,
    );

    expect(alt).toHaveValue("사용자가 바꾼 설명");
    expect(
      within(size).getByRole("radio", { name: "본문 너비의 75%" }),
    ).toBeChecked();
  });

  it.each([25, 50, 75, 100] as const)(
    "applies an image at exactly %s percent width",
    async (width) => {
      const user = userEvent.setup();
      renderLibrary();
      const size = screen.getByRole("group", {
        name: "poster.png 이미지 크기",
      });

      await user.click(
        within(size).getByRole("radio", {
          name: `본문 너비의 ${width}%`,
        }),
      );
      await user.click(
        screen.getByRole("button", { name: "poster.png 삽입" }),
      );

      expect(applyImage).toHaveBeenCalledWith({
        image: firstImage,
        alt: "poster",
        width,
      });
    },
  );

  it("appends a ready upload, updates usage, and injects tokenless lifecycle actions", async () => {
    let resolveUpload: ((result: UploadBoardImageResult) => void) | undefined;
    const uploadResult = new Promise<UploadBoardImageResult>((resolve) => {
      resolveUpload = resolve;
    });
    const uploadedImage: BoardImage = {
      id: "50000000-0000-4000-8000-000000000005",
      originalFilename: "new.gif",
      mimeType: "image/gif",
      sizeBytes: 4,
      url: "/b/summer-market/images/50000000-0000-4000-8000-000000000005",
    };
    const uploadImage = vi.fn(() => uploadResult);
    renderLibrary({
      initialLibrary: { images: [], storageBytes: 0 },
      uploadImage,
    });
    const file = new File([new Uint8Array([1, 2, 3, 4])], "new.gif", {
      type: "image/gif",
    });

    await userEvent.upload(screen.getByLabelText("이미지 추가"), file);
    expect(screen.getByRole("status")).toHaveTextContent("업로드 중");
    expect(screen.getByLabelText("이미지 추가")).toBeDisabled();

    await act(async () => {
      resolveUpload?.({ status: "ready", image: uploadedImage, storageBytes: 4 });
      await uploadResult;
    });

    expect(uploadImage).toHaveBeenCalledWith(
      { boardId, file, storageBytes: 0, imageCount: 0 },
      {
        reserveAction: reserveImageAction,
        finalizeAction: finalizeImageAction,
        cancelAction: cancelImageAction,
      },
    );
    expect(screen.getByRole("status")).toHaveTextContent("업로드 완료");
    expect(screen.getByText("new.gif")).toBeVisible();
    expect(screen.getByText("4 B / 50 MB")).toBeVisible();
  });

  it("keeps enabled focus inside the modal while upload disables and remounts its input", async () => {
    let resolveUpload: ((result: UploadBoardImageResult) => void) | undefined;
    const uploadResult = new Promise<UploadBoardImageResult>((resolve) => {
      resolveUpload = resolve;
    });
    const uploadedImage: BoardImage = {
      id: "50000000-0000-4000-8000-000000000005",
      originalFilename: "new.gif",
      mimeType: "image/gif",
      sizeBytes: 4,
      url: "/b/summer-market/images/50000000-0000-4000-8000-000000000005",
    };
    renderLibrary({
      initialLibrary: { images: [], storageBytes: 0 },
      uploadImage: vi.fn(() => uploadResult),
    });
    const fileInput = screen.getByLabelText("이미지 추가");
    const file = new File([new Uint8Array([1, 2, 3, 4])], "new.gif", {
      type: "image/gif",
    });

    fileInput.focus();
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(await screen.findByRole("status")).toHaveTextContent("업로드 중");
    const dialog = screen.getByRole("dialog", { name: "이미지 관리" });
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
      expect((document.activeElement as HTMLElement).matches(":disabled")).toBe(
        false,
      );
    });

    await act(async () => {
      resolveUpload?.({
        status: "ready",
        image: uploadedImage,
        storageBytes: 4,
      });
      await uploadResult;
    });
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
      expect((document.activeElement as HTMLElement).matches(":disabled")).toBe(
        false,
      );
    });
  });

  it("shows browser validation and retryable upload errors without adding a row", async () => {
    const user = userEvent.setup();
    const rendered = renderLibrary({
      initialLibrary: { images: [], storageBytes: 0 },
    });

    fireEvent.change(screen.getByLabelText("이미지 추가"), {
      target: {
        files: [
          new File(["<svg />"], "unsafe.svg", { type: "image/svg+xml" }),
        ],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "JPEG, PNG, WebP 또는 GIF 이미지를 선택해 주세요.",
    );
    expect(reserveImageAction).not.toHaveBeenCalled();

    rendered.unmount();
    const uploadImage = vi.fn(async () => ({
      status: "error" as const,
      message: "이미지를 업로드하지 못했습니다. 다시 시도해 주세요.",
    }));
    renderLibrary({
      initialLibrary: { images: [], storageBytes: 0 },
      uploadImage,
    });
    await user.upload(
      screen.getByLabelText("이미지 추가"),
      new File(["png"], "retry.png", { type: "image/png" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("다시 시도해 주세요");
    expect(screen.queryByText("retry.png")).not.toBeInTheDocument();
    expect(screen.getByLabelText("이미지 추가")).toHaveValue("");
  });

  it.each([
    ["the account is full", 50 * 1_048_576, [] as BoardImage[]],
    ["the board has 20 images", 0, Array.from({ length: 20 }, (_, index) => ({
      ...firstImage,
      id: `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000001`,
      originalFilename: `image-${index + 1}.png`,
      url: `/b/summer-market/images/${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000001`,
    }))],
  ])("disables upload when %s", (_name, storageBytes, images) => {
    renderLibrary({ initialLibrary: { images, storageBytes } });
    expect(screen.getByLabelText("이미지 추가")).toBeDisabled();
  });

  it("requires meaningful alt text unless the image is explicitly decorative", async () => {
    const user = userEvent.setup();
    renderLibrary();
    const altInput = screen.getByLabelText("poster.png 대체 텍스트");

    await user.clear(altInput);
    await user.click(screen.getByRole("button", { name: "poster.png 삽입" }));
    expect(screen.getByRole("alert")).toHaveTextContent("대체 텍스트를 입력하거나 장식용으로 표시해 주세요.");
    expect(screen.getByRole("dialog", { name: "이미지 관리" })).toBeVisible();
    expect(applyImage).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "poster.png 장식용 이미지" }));
    expect(altInput).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "poster.png 삽입" }));
    expect(applyImage).toHaveBeenCalledWith({
      image: firstImage,
      alt: "",
      width: 100,
    });
  });

  it("blocks deletion when current unsaved Markdown references the image", async () => {
    const user = userEvent.setup();
    renderLibrary({ contentMarkdown: `초안\n![포스터](${firstImage.url})` });

    await user.click(screen.getByRole("button", { name: "poster.png 삭제" }));

    expect(screen.getByRole("alert")).toHaveTextContent("본문에서 이 이미지를 먼저 제거해 주세요.");
    expect(screen.getByRole("dialog", { name: "이미지 관리" })).toBeVisible();
    expect(deleteImageAction).not.toHaveBeenCalled();
  });

  it("replaces management with one delete dialog and restores it with delete-button focus", async () => {
    const user = userEvent.setup();
    renderLibrary();
    const alt = screen.getByLabelText("poster.png 대체 텍스트");
    const size = screen.getByRole("group", {
      name: "poster.png 이미지 크기",
    });
    await user.clear(alt);
    await user.type(alt, "삭제를 취소해도 남는 설명");
    await user.click(
      within(size).getByRole("radio", { name: "본문 너비의 25%" }),
    );

    const deleteButton = screen.getByRole("button", {
      name: "poster.png 삭제",
    });
    await user.click(deleteButton);

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "이미지 삭제" })).toBeVisible();
    expect(
      screen.queryByRole("dialog", { name: "이미지 관리" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "이미지 관리" })).toBeVisible();
    expect(screen.getByLabelText("poster.png 대체 텍스트")).toHaveValue(
      "삭제를 취소해도 남는 설명",
    );
    expect(
      within(
        screen.getByRole("group", { name: "poster.png 이미지 크기" }),
      ).getByRole("radio", { name: "본문 너비의 25%" }),
    ).toBeChecked();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "poster.png 삭제" }),
      ).toHaveFocus(),
    );
  });

  it("never moves focus outside while switching management and delete dialogs", async () => {
    const user = userEvent.setup();
    const outsideButton = document.createElement("button");
    outsideButton.textContent = "대화 상자 밖";
    document.body.append(outsideButton);
    outsideButton.focus();
    const focusTargets: EventTarget[] = [];
    const recordFocus = (event: FocusEvent) => focusTargets.push(event.target!);
    document.addEventListener("focusin", recordFocus);

    try {
      renderLibrary();
      await waitFor(() =>
        expect(screen.getByLabelText("이미지 추가")).toHaveFocus(),
      );
      focusTargets.length = 0;

      await user.click(
        screen.getByRole("button", { name: "poster.png 삭제" }),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "poster.png 삭제 확인" }),
        ).toHaveFocus(),
      );
      expect(focusTargets).not.toContain(outsideButton);

      focusTargets.length = 0;
      await user.click(screen.getByRole("button", { name: "취소" }));
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "poster.png 삭제" }),
        ).toHaveFocus(),
      );
      expect(focusTargets).not.toContain(outsideButton);
    } finally {
      document.removeEventListener("focusin", recordFocus);
      outsideButton.remove();
    }
  });

  it("treats delete-dialog Escape as cancel without bubbling a bridge close", async () => {
    const user = userEvent.setup();
    const outerEscape = vi.fn(closeImageLibrary);
    renderLibrary({ onOuterEscape: outerEscape });
    await user.click(
      screen.getByRole("button", { name: "poster.png 삭제" }),
    );

    fireEvent.keyDown(
      screen.getByRole("button", { name: "poster.png 삭제 확인" }),
      { key: "Escape" },
    );

    expect(screen.getByRole("dialog", { name: "이미지 관리" })).toBeVisible();
    expect(closeImageLibrary).not.toHaveBeenCalled();
    expect(outerEscape).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "poster.png 삭제" }),
      ).toHaveFocus(),
    );
  });

  it("treats delete-dialog backdrop dismissal as cancel", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.click(
      screen.getByRole("button", { name: "poster.png 삭제" }),
    );

    fireEvent.pointerDown(screen.getByRole("dialog").parentElement!);

    expect(screen.getByRole("dialog", { name: "이미지 관리" })).toBeVisible();
    expect(closeImageLibrary).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "poster.png 삭제" }),
      ).toHaveFocus(),
    );
  });

  it("rechecks current Markdown after confirmation before invoking deletion", async () => {
    const user = userEvent.setup();
    const rendered = renderLibrary({ contentMarkdown: "# 참조 없음" });

    await user.click(screen.getByRole("button", { name: "poster.png 삭제" }));
    expect(screen.getByText("poster.png을 삭제할까요?")).toBeVisible();

    rendered.rerender(
      <ImageLibrary
        boardId={boardId}
        boardSlug={boardSlug}
        bridge={{
          open: true,
          selectedImage: null,
          applyImage,
          close: closeImageLibrary,
        }}
        cancelImageAction={cancelImageAction}
        contentMarkdown={`저장 전 변경\n![포스터](${firstImage.url})`}
        deleteImageAction={deleteImageAction}
        finalizeImageAction={finalizeImageAction}
        initialLibrary={{
          images: [firstImage, secondImage],
          storageBytes: 1_048_576,
        }}
        onBoardRevision={onBoardRevision}
        reserveImageAction={reserveImageAction}
      />,
    );
    await user.click(screen.getByRole("button", { name: "poster.png 삭제 확인" }));

    expect(deleteImageAction).not.toHaveBeenCalled();
    expect(screen.queryByText("poster.png을 삭제할까요?")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "이미지 관리" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "본문에서 이 이미지를 먼저 제거해 주세요.",
    );
  });

  it("confirms before delete and retains the row for in-use or failed results", async () => {
    const user = userEvent.setup();
    deleteImageAction
      .mockResolvedValueOnce({
        status: "in_use",
        message: "본문에서 이 이미지를 먼저 제거하고 저장해 주세요.",
      })
      .mockResolvedValueOnce({
        status: "error",
        message: "이미지를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        boardRevision: 7,
      });
    renderLibrary();

    await user.click(screen.getByRole("button", { name: "poster.png 삭제" }));
    expect(screen.getByText("poster.png을 삭제할까요?")).toBeVisible();
    expect(screen.getByRole("dialog", { name: "이미지 삭제" })).toBeVisible();
    expect(deleteImageAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "poster.png 삭제 확인" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("본문에서 이 이미지를 먼저 제거하고 저장해 주세요.");
    expect(screen.getByText("poster.png")).toBeVisible();
    expect(screen.getByRole("dialog", { name: "이미지 관리" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "poster.png 삭제" }));
    await user.click(screen.getByRole("button", { name: "poster.png 삭제 확인" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("잠시 후 다시 시도해 주세요");
    expect(screen.getByText("poster.png")).toBeVisible();
    expect(onBoardRevision).toHaveBeenCalledWith(7);
  });

  it("does not remove a row optimistically and applies successful usage and revision", async () => {
    const user = userEvent.setup();
    let resolveDelete: ((result: DeleteBoardImageResult) => void) | undefined;
    const deleteResult = new Promise<DeleteBoardImageResult>((resolve) => {
      resolveDelete = resolve;
    });
    deleteImageAction.mockReturnValueOnce(deleteResult);
    renderLibrary();

    await user.click(screen.getByRole("button", { name: "poster.png 삭제" }));
    await user.click(screen.getByRole("button", { name: "poster.png 삭제 확인" }));
    expect(screen.getByRole("dialog", { name: "이미지 관리" })).toBeVisible();
    expect(screen.getByText("poster.png")).toBeVisible();
    expect(deleteImageAction).toHaveBeenCalledWith({
      boardId,
      attachmentId: firstImage.id,
    });

    await act(async () => {
      resolveDelete?.({ status: "deleted", storageBytes: 262_144, boardRevision: 8 });
      await deleteResult;
    });
    expect(screen.queryByText("poster.png")).not.toBeInTheDocument();
    expect(screen.getByText("256 KB / 50 MB")).toBeVisible();
    expect(onBoardRevision).toHaveBeenCalledWith(8);
  });

  it("keeps enabled focus inside the modal while delete removes the confirm control", async () => {
    const user = userEvent.setup();
    let resolveDelete: ((result: DeleteBoardImageResult) => void) | undefined;
    const deleteResult = new Promise<DeleteBoardImageResult>((resolve) => {
      resolveDelete = resolve;
    });
    deleteImageAction.mockReturnValueOnce(deleteResult);
    renderLibrary();

    await user.click(
      screen.getByRole("button", { name: "poster.png 삭제" }),
    );
    await user.click(
      screen.getByRole("button", { name: "poster.png 삭제 확인" }),
    );
    const dialog = screen.getByRole("dialog", { name: "이미지 관리" });
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
      expect((document.activeElement as HTMLElement).matches(":disabled")).toBe(
        false,
      );
    });

    await act(async () => {
      resolveDelete?.({
        status: "error",
        message: "이미지를 삭제하지 못했습니다. 다시 시도해 주세요.",
      });
      await deleteResult;
    });
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
      expect((document.activeElement as HTMLElement).matches(":disabled")).toBe(
        false,
      );
    });
  });

  it("treats an irreversible deletion without refreshed usage as deleted and reconciles locally", async () => {
    const user = userEvent.setup();
    deleteImageAction.mockResolvedValueOnce({
      status: "deleted",
      boardRevision: 9,
    });
    renderLibrary();

    await user.click(screen.getByRole("button", { name: "poster.png 삭제" }));
    await user.click(screen.getByRole("button", { name: "poster.png 삭제 확인" }));

    await waitFor(() => expect(screen.queryByText("poster.png")).not.toBeInTheDocument());
    expect(screen.getByText("256 KB / 50 MB")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("이미지를 삭제했습니다.");
    expect(onBoardRevision).toHaveBeenCalledWith(9);
  });

  it("retains the selected image and edited width after an upload failure", async () => {
    const user = userEvent.setup();
    const bridge: ImageEditorBridge = {
      open: true,
      selectedImage: {
        src: firstImage.url,
        alt: "선택된 포스터",
        width: 75,
      },
      applyImage,
      close: closeImageLibrary,
    };
    renderLibrary({
      bridge,
      uploadImage: vi.fn(async () => ({
        status: "error" as const,
        message: "이미지를 업로드하지 못했습니다. 다시 시도해 주세요.",
      })),
    });
    const size = screen.getByRole("group", {
      name: "poster.png 이미지 크기",
    });
    await user.click(
      within(size).getByRole("radio", { name: "본문 너비의 25%" }),
    );

    await user.upload(
      screen.getByLabelText("이미지 추가"),
      new File(["png"], "retry.png", { type: "image/png" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "다시 시도해 주세요",
    );
    expect(
      screen.getByRole("button", { name: "이미지 수정" }),
    ).toBeVisible();
    expect(
      within(size).getByRole("radio", { name: "본문 너비의 25%" }),
    ).toBeChecked();
  });

  it("delegates modal closing to the editor bridge", () => {
    renderLibrary();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "이미지 관리" }), {
      key: "Escape",
    });

    expect(closeImageLibrary).toHaveBeenCalledOnce();
  });
});
