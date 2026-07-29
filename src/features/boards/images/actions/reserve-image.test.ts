import { beforeEach, describe, expect, it, vi } from "vitest";
import { reserveBoardImage } from "./reserve-image";

const ownerId = "10000000-0000-4000-8000-000000000001";
const boardId = "20000000-0000-4000-8000-000000000002";
const attachmentId = "30000000-0000-4000-8000-000000000003";
const storagePath = `${ownerId}/${boardId}/${attachmentId}`;

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  cleanupExpiredBoardImages: vi.fn(),
  rpc: vi.fn(),
  adminStorageFrom: vi.fn(),
  createSignedUploadUrl: vi.fn(),
}));

vi.mock("@/features/auth/require-user", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    rpc: mocks.rpc,
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    storage: { from: mocks.adminStorageFrom },
  })),
}));

vi.mock("../storage", () => ({
  cleanupExpiredBoardImages: mocks.cleanupExpiredBoardImages,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: ownerId, email: null });
  mocks.cleanupExpiredBoardImages.mockResolvedValue({ ok: true });
  mocks.adminStorageFrom.mockReturnValue({
    createSignedUploadUrl: mocks.createSignedUploadUrl,
  });
  mocks.rpc.mockResolvedValue({
    data: [
      {
        id: attachmentId,
        storage_path: storagePath,
        original_filename: "poster.png",
        mime_type: "image/png",
        size_bytes: 120,
        reservation_expires_at: "2026-07-29T10:15:00.000Z",
      },
    ],
    error: null,
  });
  mocks.createSignedUploadUrl.mockResolvedValue({
    data: { path: storagePath, token: "signed-token", signedUrl: "hidden" },
    error: null,
  });
});

describe("reserveBoardImage", () => {
  it("rejects invalid input before authentication", async () => {
    await expect(
      reserveBoardImage({
        boardId: "not-a-uuid",
        originalFilename: "poster.png",
        mimeType: "image/png",
        sizeBytes: 120,
      }),
    ).resolves.toEqual({
      status: "error",
      code: "invalid",
      message: "업로드할 이미지를 확인해 주세요.",
    });

    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("authenticates the owner, cleans expiry first, normalizes the display name, and signs without upsert", async () => {
    const calls: string[] = [];
    mocks.cleanupExpiredBoardImages.mockImplementation(async () => {
      calls.push("cleanup");
      return { ok: true };
    });
    mocks.rpc.mockImplementation(async (name: string) => {
      calls.push(name);
      return {
        data: [
          {
            id: attachmentId,
            storage_path: storagePath,
            original_filename: "poster.png",
            mime_type: "image/png",
            size_bytes: 120,
            reservation_expires_at: "2026-07-29T10:15:00.000Z",
          },
        ],
        error: null,
      };
    });

    await expect(
      reserveBoardImage({
        boardId,
        originalFilename: "../folder/\u0000poster.png",
        mimeType: "image/png",
        sizeBytes: 120,
      }),
    ).resolves.toEqual({
      status: "reserved",
      attachmentId,
      path: storagePath,
      token: "signed-token",
    });

    expect(mocks.requireUser).toHaveBeenCalledWith(`/boards/${boardId}/edit`);
    expect(mocks.cleanupExpiredBoardImages).toHaveBeenCalledWith(
      ownerId,
      expect.objectContaining({ rpc: mocks.rpc }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith("reserve_board_image", {
      p_board_id: boardId,
      p_original_filename: "poster.png",
      p_mime_type: "image/png",
      p_size_bytes: 120,
    });
    expect(mocks.createSignedUploadUrl).toHaveBeenCalledWith(storagePath, {
      upsert: false,
    });
    expect(calls).toEqual(["cleanup", "reserve_board_image"]);
  });

  it.each([
    ["image_quota_exceeded", "quota"],
    ["image_limit_exceeded", "limit"],
    ["image_invalid_size", "invalid"],
    ["image_invalid_mime_type", "invalid"],
  ] as const)("maps stable P0001 %s errors to %s", async (message, code) => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message },
    });

    const result = await reserveBoardImage({
      boardId,
      originalFilename: "poster.png",
      mimeType: "image/png",
      sizeBytes: 120,
    });

    expect(result).toMatchObject({ status: "error", code });
    expect(JSON.stringify(result)).not.toContain(storagePath);
  });

  it("does not reserve when expired object cleanup cannot complete", async () => {
    mocks.cleanupExpiredBoardImages.mockResolvedValueOnce({ ok: false });

    await expect(
      reserveBoardImage({
        boardId,
        originalFilename: "poster.png",
        mimeType: "image/png",
        sizeBytes: 120,
      }),
    ).resolves.toMatchObject({ status: "error", code: "unavailable" });

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("cancels a reservation when signed token creation fails and returns no path", async () => {
    mocks.createSignedUploadUrl.mockResolvedValueOnce({
      data: null,
      error: { message: `signing failed for ${storagePath}` },
    });

    const result = await reserveBoardImage({
      boardId,
      originalFilename: "poster.png",
      mimeType: "image/png",
      sizeBytes: 120,
    });

    expect(mocks.rpc).toHaveBeenLastCalledWith("cancel_board_image", {
      p_attachment_id: attachmentId,
    });
    expect(result).toMatchObject({ status: "error", code: "unavailable" });
    expect(JSON.stringify(result)).not.toContain(storagePath);
  });
});
