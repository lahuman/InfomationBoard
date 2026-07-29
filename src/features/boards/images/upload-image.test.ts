import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  uploadBoardImage,
  type UploadBoardImageActions,
} from "./upload-image";

const boardId = "20000000-0000-4000-8000-000000000002";
const attachmentId = "30000000-0000-4000-8000-000000000003";
const storagePath = `10000000-0000-4000-8000-000000000001/${boardId}/${attachmentId}`;

const uploadToSignedUrl = vi.fn();
const createBrowserClient = vi.fn(() => ({
  storage: {
    from: vi.fn(() => ({ uploadToSignedUrl })),
  },
}));
const reserveAction = vi.fn();
const finalizeAction = vi.fn();
const cancelAction = vi.fn();

const actions: UploadBoardImageActions = {
  reserveAction,
  finalizeAction,
  cancelAction,
};

vi.mock("server-only", () => ({}));

function imageFile(
  bytes = new Uint8Array([1, 2, 3]),
  type = "image/png",
) {
  return new File([bytes], "poster.png", { type });
}

beforeEach(() => {
  vi.clearAllMocks();
  reserveAction.mockResolvedValue({
    status: "reserved",
    attachmentId,
    path: storagePath,
    token: "signed-token",
  });
  uploadToSignedUrl.mockResolvedValue({ data: { path: storagePath }, error: null });
  finalizeAction.mockResolvedValue({
    status: "ready",
    image: {
      id: attachmentId,
      originalFilename: "poster.png",
      mimeType: "image/png",
      sizeBytes: 3,
      url: `/b/summer-market/images/${attachmentId}`,
    },
    storageBytes: 3,
  });
  cancelAction.mockResolvedValue({ status: "cancelled" });
});

describe("uploadBoardImage", () => {
  it("coordinates reserve, direct signed upload, and finalize in exact order", async () => {
    const calls: string[] = [];
    reserveAction.mockImplementationOnce(async () => {
      calls.push("reserve");
      return {
        status: "reserved",
        attachmentId,
        path: storagePath,
        token: "signed-token",
      };
    });
    uploadToSignedUrl.mockImplementationOnce(async () => {
      calls.push("upload");
      return { data: { path: storagePath }, error: null };
    });
    finalizeAction.mockImplementationOnce(async () => {
      calls.push("finalize");
      return {
        status: "ready",
        image: {
          id: attachmentId,
          originalFilename: "poster.png",
          mimeType: "image/png",
          sizeBytes: 3,
          url: `/b/summer-market/images/${attachmentId}`,
        },
        storageBytes: 3,
      };
    });
    const file = imageFile();

    await expect(
      uploadBoardImage(
        { boardId, file, storageBytes: 0, imageCount: 0 },
        actions,
        createBrowserClient as never,
      ),
    ).resolves.toMatchObject({ status: "ready" });

    expect(calls).toEqual(["reserve", "upload", "finalize"]);
    expect(uploadToSignedUrl).toHaveBeenCalledWith(
      storagePath,
      "signed-token",
      file,
      {
        contentType: "image/png",
        upsert: false,
      },
    );
  });

  it("cancels exactly once and never finalizes after upload failure", async () => {
    uploadToSignedUrl.mockResolvedValueOnce({
      data: null,
      error: { message: "network failed" },
    });

    await expect(
      uploadBoardImage(
        { boardId, file: imageFile(), storageBytes: 0, imageCount: 0 },
        actions,
        createBrowserClient as never,
      ),
    ).resolves.toEqual({
      status: "error",
      message: "이미지를 업로드하지 못했습니다. 다시 시도해 주세요.",
    });

    expect(cancelAction).toHaveBeenCalledTimes(1);
    expect(cancelAction).toHaveBeenCalledWith({ boardId, attachmentId });
    expect(finalizeAction).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "zero byte",
      file: imageFile(new Uint8Array()),
      storageBytes: 0,
      imageCount: 0,
    },
    {
      name: "unsupported MIME",
      file: imageFile(new Uint8Array([1]), "image/svg+xml"),
      storageBytes: 0,
      imageCount: 0,
    },
    {
      name: "insufficient visible quota",
      file: imageFile(new Uint8Array([1, 2])),
      storageBytes: 50 * 1_048_576 - 1,
      imageCount: 0,
    },
    {
      name: "20-image limit",
      file: imageFile(new Uint8Array([1])),
      storageBytes: 0,
      imageCount: 20,
    },
  ])("rejects $name before creating a client or reserving", async (input) => {
    await expect(
      uploadBoardImage(
        {
          boardId,
          file: input.file,
          storageBytes: input.storageBytes,
          imageCount: input.imageCount,
        },
        actions,
        createBrowserClient as never,
      ),
    ).resolves.toMatchObject({ status: "error" });

    expect(createBrowserClient).not.toHaveBeenCalled();
    expect(reserveAction).not.toHaveBeenCalled();
  });

  it("allows an image exactly 10 MB when count and visible quota permit it", async () => {
    const file = imageFile(new Uint8Array(10 * 1_048_576));

    await expect(
      uploadBoardImage(
        { boardId, file, storageBytes: 0, imageCount: 19 },
        actions,
        createBrowserClient as never,
      ),
    ).resolves.toMatchObject({ status: "ready" });

    expect(reserveAction).toHaveBeenCalledWith({
      boardId,
      originalFilename: "poster.png",
      mimeType: "image/png",
      sizeBytes: 10 * 1_048_576,
    });
  });
});
