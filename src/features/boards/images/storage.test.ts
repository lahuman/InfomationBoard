import { beforeEach, describe, expect, it, vi } from "vitest";
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

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  ownerEq: vi.fn(),
  candidatesOr: vi.fn(),
  storageFrom: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    from: mocks.from,
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
});

describe("cancelBoardImageReservation", () => {
  it("claims before removing and completes only after removal", async () => {
    const calls: string[] = [];
    const rpc = vi.fn(async (name: string) => {
      calls.push(name);
      if (name === "claim_board_image_cancellation") {
        return {
          data: [{ id: attachmentId, storage_path: storagePath, state: "cancelling" }],
          error: null,
        };
      }
      return { data: undefined, error: null };
    });
    mocks.remove.mockImplementationOnce(async () => {
      calls.push("remove");
      return { data: [], error: null };
    });

    await expect(
      cancelBoardImageReservation(boardId, attachmentId, { rpc } as never),
    ).resolves.toEqual({ ok: true });

    expect(rpc).toHaveBeenNthCalledWith(1, "claim_board_image_cancellation", {
      p_board_id: boardId,
      p_attachment_id: attachmentId,
    });
    expect(mocks.remove).toHaveBeenCalledWith([storagePath]);
    expect(rpc).toHaveBeenNthCalledWith(2, "complete_board_image_cancellation", {
      p_board_id: boardId,
      p_attachment_id: attachmentId,
    });
    expect(calls).toEqual([
      "claim_board_image_cancellation",
      "remove",
      "complete_board_image_cancellation",
    ]);
  });

  it("keeps the cancelling row and quota when removal fails", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ id: attachmentId, storage_path: storagePath, state: "cancelling" }],
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
  });

  it("continues completion only for exact object-missing", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "claim_board_image_cancellation"
        ? {
            data: [{ id: attachmentId, storage_path: storagePath, state: "cancelling" }],
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
    expect(rpc).toHaveBeenLastCalledWith(
      "complete_board_image_cancellation",
      { p_board_id: boardId, p_attachment_id: attachmentId },
    );
  });
});

describe("cleanupExpiredBoardImages", () => {
  it("claims expired reserved and existing cancelling rows through the same cleanup path", async () => {
    const cancellingId = "40000000-0000-4000-8000-000000000004";
    const cancellingPath = `${ownerId}/${boardId}/${cancellingId}`;
    mocks.candidatesOr.mockResolvedValue({
      data: [
        { id: attachmentId, board_id: boardId },
        { id: cancellingId, board_id: boardId },
      ],
      error: null,
    });
    const rpc = vi.fn(async (name: string, args: { p_attachment_id: string }) => {
      if (name === "claim_board_image_cancellation") {
        return {
          data: [{
            id: args.p_attachment_id,
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
      `state.eq.cancelling,and(state.eq.reserved,reservation_expires_at.lt.2026-07-29T10:00:00.000Z)`,
    );
    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledTimes(4);
  });
});
