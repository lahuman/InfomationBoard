import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelBoardImage } from "./cancel-image";

const ownerId = "10000000-0000-4000-8000-000000000001";
const boardId = "20000000-0000-4000-8000-000000000002";
const attachmentId = "30000000-0000-4000-8000-000000000003";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
  cancelBoardImageReservation: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));
vi.mock("../storage", () => ({
  cancelBoardImageReservation: mocks.cancelBoardImageReservation,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: ownerId, email: null });
  mocks.cancelBoardImageReservation.mockResolvedValue({ ok: true });
});

describe("cancelBoardImage", () => {
  it("rejects invalid input before authentication", async () => {
    await expect(
      cancelBoardImage({ boardId, attachmentId: "invalid" }),
    ).resolves.toEqual({
      status: "error",
      message: "취소할 업로드 정보를 확인해 주세요.",
    });
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });

  it("uses the authenticated claim cleanup without accepting owner or path", async () => {
    await expect(
      cancelBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({ status: "cancelled" });

    expect(mocks.requireUser).toHaveBeenCalledWith(`/boards/${boardId}/edit`);
    expect(mocks.cancelBoardImageReservation).toHaveBeenCalledWith(
      boardId,
      attachmentId,
      expect.objectContaining({ rpc: mocks.rpc }),
    );
  });

  it("returns a safe retryable error while a cancelling row retains quota", async () => {
    mocks.cancelBoardImageReservation.mockResolvedValueOnce({ ok: false });

    await expect(
      cancelBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({
      status: "error",
      message: "업로드를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  });
});
