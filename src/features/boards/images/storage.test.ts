import { beforeEach, describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import sharp from "sharp";
import {
  InvalidStoredImageError,
  StoredImageUnavailableError,
  cancelBoardImageReservation,
  cleanupExpiredBoardImages,
  isMissingStorageObjectError,
  verifyStoredImage,
} from "./storage";

const ownerId = "10000000-0000-4000-8000-000000000001";
const boardId = "20000000-0000-4000-8000-000000000002";
const attachmentId = "30000000-0000-4000-8000-000000000003";
const storagePath = `${ownerId}/${boardId}/${attachmentId}`;
const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function encodedFixture(
  format: "jpeg" | "png" | "webp" | "gif",
): Promise<Buffer> {
  const image = sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 220, g: 20, b: 60, alpha: 1 },
    },
  });
  switch (format) {
    case "jpeg":
      return image.jpeg().toBuffer();
    case "png":
      return image.png().toBuffer();
    case "webp":
      return image.webp().toBuffer();
    case "gif":
      return image.gif().toBuffer();
  }
}

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  ownerEq: vi.fn(),
  candidatesOr: vi.fn(),
  storageFrom: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
  adminRpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    from: mocks.from,
    rpc: mocks.adminRpc,
    storage: { from: mocks.storageFrom },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.ownerEq });
  mocks.ownerEq.mockReturnValue({ or: mocks.candidatesOr });
  mocks.candidatesOr.mockResolvedValue({ data: [], error: null });
  mocks.storageFrom.mockReturnValue({
    download: mocks.download,
    remove: mocks.remove,
  });
  mocks.download.mockResolvedValue({
    data: new Blob([new Uint8Array(pngBytes)]),
    error: null,
  });
  mocks.remove.mockResolvedValue({ data: [], error: null });
  mocks.adminRpc.mockResolvedValue({ data: undefined, error: null });
});

describe("Storage object errors", () => {
  it("recognizes only the exact object-missing StorageApiError", () => {
    expect(
      isMissingStorageObjectError({
        name: "StorageApiError",
        status: 404,
        message: "Object not found",
      }),
    ).toBe(true);

    expect(
      isMissingStorageObjectError({
        name: "StorageApiError",
        status: 404,
        message: "Bucket not found",
      }),
    ).toBe(false);
    expect(
      isMissingStorageObjectError({
        name: "StorageApiError",
        status: 404,
        message: "Route not found",
      }),
    ).toBe(false);
    expect(
      isMissingStorageObjectError({
        name: "StorageApiError",
        status: 403,
        message: "Object not found",
      }),
    ).toBe(false);
    expect(
      isMissingStorageObjectError({
        statusCode: "404",
        message: "Object not found",
      }),
    ).toBe(false);
  });
});

describe("verifyStoredImage", () => {
  it("returns the decoded MIME and exact downloaded bytes", async () => {
    const verified = await verifyStoredImage(storagePath);
    expect(verified.mimeType).toBe("image/png");
    expect(Buffer.from(verified.bytes)).toEqual(pngBytes);
    expect(mocks.download).toHaveBeenCalledWith(storagePath);
  });

  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
    ["gif", "image/gif"],
  ] as const)("accepts decoded %s bytes as %s", async (format, mimeType) => {
    const bytes = await encodedFixture(format);
    mocks.download.mockResolvedValueOnce({
      data: new Blob([new Uint8Array(bytes)]),
      error: null,
    });

    await expect(verifyStoredImage(storagePath)).resolves.toEqual({
      bytes,
      mimeType,
    });
  });

  it("accepts a valid image at the exact 10 MB byte limit", async () => {
    const exactLimitBytes = Buffer.concat([
      pngBytes,
      Buffer.alloc(10 * 1_048_576 - pngBytes.byteLength),
    ]);
    mocks.download.mockResolvedValueOnce({
      data: new NodeBlob([exactLimitBytes]),
      error: null,
    });

    const verified = await verifyStoredImage(storagePath);
    expect(verified.mimeType).toBe("image/png");
    expect(verified.bytes.byteLength).toBe(10 * 1_048_576);
  });

  it("treats only exact object-missing as an invalid upload", async () => {
    mocks.download.mockResolvedValueOnce({
      data: null,
      error: {
        name: "StorageApiError",
        status: 404,
        message: "Object not found",
      },
    });
    await expect(verifyStoredImage(storagePath)).rejects.toBeInstanceOf(
      InvalidStoredImageError,
    );

    mocks.download.mockResolvedValueOnce({
      data: null,
      error: {
        name: "StorageApiError",
        status: 404,
        message: "Bucket not found",
      },
    });
    await expect(verifyStoredImage(storagePath)).rejects.toBeInstanceOf(
      StoredImageUnavailableError,
    );
  });

  it("rejects malformed bytes and bytes above 10 MB", async () => {
    mocks.download.mockResolvedValueOnce({
      data: new Blob([new Uint8Array([1, 2, 3, 4])]),
      error: null,
    });
    await expect(verifyStoredImage(storagePath)).rejects.toBeInstanceOf(
      InvalidStoredImageError,
    );

    mocks.download.mockResolvedValueOnce({
      data: new Blob([new Uint8Array(10 * 1_048_576 + 1)]),
      error: null,
    });
    await expect(verifyStoredImage(storagePath)).rejects.toBeInstanceOf(
      InvalidStoredImageError,
    );
  });

  it("rejects zero-byte objects", async () => {
    mocks.download.mockResolvedValueOnce({
      data: new Blob([]),
      error: null,
    });

    await expect(verifyStoredImage(storagePath)).rejects.toBeInstanceOf(
      InvalidStoredImageError,
    );
  });

  it("rejects decoded images above the 40 million pixel limit", async () => {
    const oversizedDimensions = await sharp({
      create: {
        width: 6_325,
        height: 6_325,
        channels: 3,
        background: { r: 1, g: 2, b: 3 },
      },
    }).png().toBuffer();
    mocks.download.mockResolvedValueOnce({
      data: new Blob([new Uint8Array(oversizedDimensions)]),
      error: null,
    });

    await expect(verifyStoredImage(storagePath)).rejects.toBeInstanceOf(
      InvalidStoredImageError,
    );
  });
});

describe("cancelBoardImageReservation", () => {
  it("claims before removing and completes only after removal", async () => {
    const calls: string[] = [];
    const rpc = vi.fn(async (name: string) => {
      calls.push(name);
      if (name === "claim_board_image_cancellation") {
        return {
          data: [{
            id: attachmentId,
            owner_id: ownerId,
            storage_path: storagePath,
            state: "cancelling",
          }],
          error: null,
        };
      }
      return { data: undefined, error: null };
    });
    mocks.remove.mockImplementationOnce(async () => {
      calls.push("remove");
      return { data: [], error: null };
    });
    mocks.adminRpc.mockImplementationOnce(async () => {
      calls.push("complete_board_image_cancellation");
      return { data: undefined, error: null };
    });

    await expect(
      cancelBoardImageReservation(boardId, attachmentId, { rpc } as never),
    ).resolves.toEqual({ ok: true });

    expect(rpc).toHaveBeenNthCalledWith(1, "claim_board_image_cancellation", {
      p_board_id: boardId,
      p_attachment_id: attachmentId,
    });
    expect(mocks.remove).toHaveBeenCalledWith([storagePath]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      "complete_board_image_cancellation",
      {
        p_owner_id: ownerId,
        p_board_id: boardId,
        p_attachment_id: attachmentId,
      },
    );
    expect(calls).toEqual([
      "claim_board_image_cancellation",
      "remove",
      "complete_board_image_cancellation",
    ]);
  });

  it("does not let the authenticated client invoke completion", async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        id: attachmentId,
        owner_id: ownerId,
        storage_path: storagePath,
        state: "cancelling",
      }],
      error: null,
    }));

    await cancelBoardImageReservation(
      boardId,
      attachmentId,
      { rpc } as never,
    );

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalledWith("complete_board_image_cancellation", {
      p_board_id: boardId,
      p_attachment_id: attachmentId,
    });
  });

  it("keeps the cancelling row and quota when removal fails", async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        id: attachmentId,
        owner_id: ownerId,
        storage_path: storagePath,
        state: "cancelling",
      }],
      error: null,
    }));
    mocks.remove.mockResolvedValueOnce({
      data: null,
      error: { name: "StorageApiError", status: 503, message: "Unavailable" },
    });

    await expect(
      cancelBoardImageReservation(boardId, attachmentId, { rpc } as never),
    ).resolves.toEqual({ ok: false });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it("continues completion only for exact object-missing", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "claim_board_image_cancellation"
        ? {
            data: [{
              id: attachmentId,
              owner_id: ownerId,
              storage_path: storagePath,
              state: "cancelling",
            }],
            error: null,
          }
        : { data: undefined, error: null },
    );
    mocks.remove.mockResolvedValueOnce({
      data: null,
      error: {
        name: "StorageApiError",
        status: 404,
        message: "Object not found",
      },
    });

    await expect(
      cancelBoardImageReservation(boardId, attachmentId, { rpc } as never),
    ).resolves.toEqual({ ok: true });
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      "complete_board_image_cancellation",
      {
        p_owner_id: ownerId,
        p_board_id: boardId,
        p_attachment_id: attachmentId,
      },
    );
  });
});

describe("cleanupExpiredBoardImages", () => {
  it("claims expired reserved and existing cancelling rows through the same cleanup path", async () => {
    const cancellingId = "40000000-0000-4000-8000-000000000004";
    const cancellingPath = `${ownerId}/${boardId}/${cancellingId}`;
    mocks.candidatesOr.mockResolvedValue({
      data: [
        {
          id: attachmentId,
          board_id: boardId,
          owner_id: ownerId,
          storage_path: storagePath,
          state: "reserved",
        },
        {
          id: cancellingId,
          board_id: boardId,
          owner_id: ownerId,
          storage_path: cancellingPath,
          state: "cancelling",
        },
      ],
      error: null,
    });
    const rpc = vi.fn(async (name: string, args: { p_attachment_id: string }) => {
      if (name === "claim_board_image_cancellation") {
        return {
          data: [{
            id: args.p_attachment_id,
            owner_id: ownerId,
            storage_path: args.p_attachment_id === attachmentId ? storagePath : cancellingPath,
            state: "cancelling",
          }],
          error: null,
        };
      }
      return { data: undefined, error: null };
    });

    await expect(
      cleanupExpiredBoardImages(ownerId, { rpc } as never, new Date("2026-07-29T10:00:00.000Z")),
    ).resolves.toEqual({ ok: true });

    expect(mocks.candidatesOr).toHaveBeenCalledWith(
      `state.eq.deleting,state.eq.cancelling,and(state.eq.reserved,reservation_expires_at.lt.2026-07-29T10:00:00.000Z)`,
    );
    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(mocks.adminRpc).toHaveBeenCalledTimes(2);
  });

  it("resumes an invisible deleting row after reload without using authenticated completion", async () => {
    mocks.candidatesOr.mockResolvedValueOnce({
      data: [{
        id: attachmentId,
        board_id: boardId,
        owner_id: ownerId,
        storage_path: storagePath,
        state: "deleting",
      }],
      error: null,
    });
    const rpc = vi.fn();

    await expect(
      cleanupExpiredBoardImages(ownerId, { rpc } as never),
    ).resolves.toEqual({ ok: true });

    expect(mocks.remove).toHaveBeenCalledWith([storagePath]);
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      "complete_board_image_deletion",
      {
        p_owner_id: ownerId,
        p_board_id: boardId,
        p_attachment_id: attachmentId,
      },
    );
  });

  it("keeps an invisible deleting row charged when reload cleanup cannot remove its object", async () => {
    mocks.candidatesOr.mockResolvedValueOnce({
      data: [{
        id: attachmentId,
        board_id: boardId,
        owner_id: ownerId,
        storage_path: storagePath,
        state: "deleting",
      }],
      error: null,
    });
    mocks.remove.mockResolvedValueOnce({
      data: null,
      error: { name: "StorageApiError", status: 503, message: "Unavailable" },
    });

    await expect(
      cleanupExpiredBoardImages(ownerId, { rpc: vi.fn() } as never),
    ).resolves.toEqual({ ok: false });

    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });
});
