import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InvalidStoredImageError,
  cleanupExpiredBoardImages,
  verifyStoredImage,
} from "./storage";

const ownerId = "10000000-0000-4000-8000-000000000001";
const attachmentId = "30000000-0000-4000-8000-000000000003";
const storagePath = `${ownerId}/20000000-0000-4000-8000-000000000002/${attachmentId}`;
const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  ownerEq: vi.fn(),
  stateEq: vi.fn(),
  expiresLt: vi.fn(),
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
  mocks.ownerEq.mockReturnValue({ eq: mocks.stateEq });
  mocks.stateEq.mockReturnValue({ lt: mocks.expiresLt });
  mocks.expiresLt.mockResolvedValue({ data: [], error: null });
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

describe("verifyStoredImage", () => {
  it("downloads from the private image bucket and returns the decoded MIME and exact bytes", async () => {
    const verified = await verifyStoredImage(storagePath);

    expect(verified.mimeType).toBe("image/png");
    expect(Buffer.from(verified.bytes)).toEqual(pngBytes);
    expect(mocks.download).toHaveBeenCalledWith(storagePath);
  });

  it("rejects a missing object, malformed bytes, and bytes above 10 MB", async () => {
    mocks.download.mockResolvedValueOnce({
      data: null,
      error: { statusCode: "404", message: "Object not found" },
    });
    await expect(verifyStoredImage(storagePath)).rejects.toBeInstanceOf(
      InvalidStoredImageError,
    );

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

describe("cleanupExpiredBoardImages", () => {
  it("removes each expired owned object before cancelling its reservation", async () => {
    const calls: string[] = [];
    const rpc = vi.fn(async () => {
      calls.push("cancel");
      return { data: undefined, error: null };
    });
    mocks.remove.mockImplementation(async () => {
      calls.push("remove");
      return { data: [], error: null };
    });
    mocks.expiresLt.mockResolvedValue({
      data: [{ id: attachmentId, storage_path: storagePath }],
      error: null,
    });

    await expect(
      cleanupExpiredBoardImages(ownerId, { rpc } as never),
    ).resolves.toEqual({ ok: true });

    expect(mocks.ownerEq).toHaveBeenCalledWith("owner_id", ownerId);
    expect(mocks.stateEq).toHaveBeenCalledWith("state", "reserved");
    expect(mocks.remove).toHaveBeenCalledWith([storagePath]);
    expect(rpc).toHaveBeenCalledWith("cancel_board_image", {
      p_attachment_id: attachmentId,
    });
    expect(calls).toEqual(["remove", "cancel"]);
  });

  it("fails closed and retains quota when object removal fails", async () => {
    const rpc = vi.fn();
    mocks.expiresLt.mockResolvedValue({
      data: [{ id: attachmentId, storage_path: storagePath }],
      error: null,
    });
    mocks.remove.mockResolvedValue({
      data: null,
      error: { message: "storage unavailable" },
    });

    await expect(
      cleanupExpiredBoardImages(ownerId, { rpc } as never),
    ).resolves.toEqual({ ok: false });

    expect(rpc).not.toHaveBeenCalled();
  });

  it("cancels the row when a previous attempt already removed the object", async () => {
    const rpc = vi.fn(async () => ({ data: undefined, error: null }));
    mocks.expiresLt.mockResolvedValue({
      data: [{ id: attachmentId, storage_path: storagePath }],
      error: null,
    });
    mocks.remove.mockResolvedValue({
      data: null,
      error: { statusCode: "404", message: "Object not found" },
    });

    await expect(
      cleanupExpiredBoardImages(ownerId, { rpc } as never),
    ).resolves.toEqual({ ok: true });

    expect(rpc).toHaveBeenCalledWith("cancel_board_image", {
      p_attachment_id: attachmentId,
    });
  });
});
