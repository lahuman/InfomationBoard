import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelBoardImage } from "./cancel-image";

const ownerId = "10000000-0000-4000-8000-000000000001";
const boardId = "20000000-0000-4000-8000-000000000002";
const attachmentId = "30000000-0000-4000-8000-000000000003";
const storagePath = `${ownerId}/${boardId}/${attachmentId}`;

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
  remove: vi.fn(),
  adminRpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    rpc: mocks.adminRpc,
    storage: { from: mocks.storageFrom },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: ownerId, email: null });
  mocks.rpc.mockResolvedValue({
    data: [{
      id: attachmentId,
      owner_id: ownerId,
      storage_path: storagePath,
      state: "cancelling",
    }],
    error: null,
  });
  mocks.storageFrom.mockReturnValue({ remove: mocks.remove });
  mocks.remove.mockResolvedValue({ data: [], error: null });
  mocks.adminRpc.mockResolvedValue({ data: undefined, error: null });
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

  it("uses the authenticated claim and trusted completion without client-supplied owner or path", async () => {
    await expect(
      cancelBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({ status: "cancelled" });

    expect(mocks.requireUser).toHaveBeenCalledWith(`/boards/${boardId}/edit`);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "claim_board_image_cancellation",
      { p_board_id: boardId, p_attachment_id: attachmentId },
    );
    expect(mocks.remove).toHaveBeenCalledWith([storagePath]);
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      "complete_board_image_cancellation",
      {
        p_owner_id: ownerId,
        p_board_id: boardId,
        p_attachment_id: attachmentId,
      },
    );
  });

  it("returns a safe retryable error while a cancelling row retains quota", async () => {
    mocks.remove.mockResolvedValueOnce({
      data: null,
      error: { name: "StorageApiError", status: 503, message: "Unavailable" },
    });

    await expect(
      cancelBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({
      status: "error",
      message: "업로드를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it("retries the full action after a committed cancellation claim response is lost", async () => {
    let state: "reserved" | "cancelling" = "reserved";
    mocks.rpc.mockImplementation(async () => {
      if (state === "reserved") {
        state = "cancelling";
        throw new Error("response lost after commit");
      }
      return {
        data: [{
          id: attachmentId,
          owner_id: ownerId,
          storage_path: storagePath,
          state,
        }],
        error: null,
      };
    });

    await expect(
      cancelBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({
      status: "error",
      message: "업로드를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(mocks.remove).not.toHaveBeenCalled();

    await expect(
      cancelBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({ status: "cancelled" });

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.adminRpc).toHaveBeenCalledTimes(1);
  });
});
