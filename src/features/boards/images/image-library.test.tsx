import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
const onInsert = vi.fn<(image: BoardImage, alt: string) => boolean>();
const onBoardRevision = vi.fn<(revision: number) => void>();

function renderLibrary(
  options: {
    contentMarkdown?: string;
    initialLibrary?: BoardImageLibrary;
    uploadImage?: ImageLibraryProps["uploadImage"];
  } = {},
) {
  return render(
    <ImageLibrary
      boardId={boardId}
      boardSlug={boardSlug}
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
      onInsert={onInsert}
      reserveImageAction={reserveImageAction}
      uploadImage={options.uploadImage}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  onInsert.mockReturnValue(true);
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
  it("presents the full 50 MB quota and accessible image controls", () => {
    const { container } = renderLibrary();

    expect(screen.getByRole("heading", { name: "이미지 라이브러리" })).toBeVisible();
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
    expect(onInsert).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "poster.png 장식용 이미지" }));
    expect(altInput).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "poster.png 삽입" }));
    expect(onInsert).toHaveBeenCalledWith(firstImage, "");
  });

  it("blocks deletion when current unsaved Markdown references the image", async () => {
    const user = userEvent.setup();
    renderLibrary({ contentMarkdown: `초안\n![포스터](${firstImage.url})` });

    await user.click(screen.getByRole("button", { name: "poster.png 삭제" }));

    expect(screen.getByRole("alert")).toHaveTextContent("본문에서 이 이미지를 먼저 제거해 주세요.");
    expect(deleteImageAction).not.toHaveBeenCalled();
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
        cancelImageAction={cancelImageAction}
        contentMarkdown={`저장 전 변경\n![포스터](${firstImage.url})`}
        deleteImageAction={deleteImageAction}
        finalizeImageAction={finalizeImageAction}
        initialLibrary={{
          images: [firstImage, secondImage],
          storageBytes: 1_048_576,
        }}
        onBoardRevision={onBoardRevision}
        onInsert={onInsert}
        reserveImageAction={reserveImageAction}
      />,
    );
    await user.click(screen.getByRole("button", { name: "poster.png 삭제 확인" }));

    expect(deleteImageAction).not.toHaveBeenCalled();
    expect(screen.queryByText("poster.png을 삭제할까요?")).not.toBeInTheDocument();
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
    expect(deleteImageAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "poster.png 삭제 확인" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("본문에서 이 이미지를 먼저 제거하고 저장해 주세요.");
    expect(screen.getByText("poster.png")).toBeVisible();

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
    expect(screen.getByText("poster.png")).toBeVisible();

    await act(async () => {
      resolveDelete?.({ status: "deleted", storageBytes: 262_144, boardRevision: 8 });
      await deleteResult;
    });
    expect(screen.queryByText("poster.png")).not.toBeInTheDocument();
    expect(screen.getByText("256 KB / 50 MB")).toBeVisible();
    expect(onBoardRevision).toHaveBeenCalledWith(8);
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
});
