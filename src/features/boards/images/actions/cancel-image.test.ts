import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelBoardImage } from "./cancel-image";

const ownerId = "10000000-0000-4000-8000-000000000001";
const boardId = "20000000-0000-4000-8000-000000000002";
const attachmentId = "30000000-0000-4000-8000-000000000003";
const storagePath = `${ownerId}/${boardId}/${attachmentId}`;

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  idEq: vi.fn(),
  boardEq: vi.fn(),
  ownerEq: vi.fn(),
  stateEq: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/features/auth/require-user", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    storage: { from: mocks.storageFrom },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: ownerId, email: null });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.idEq });
  mocks.idEq.mockReturnValue({ eq: mocks.boardEq });
  mocks.boardEq.mockReturnValue({ eq: mocks.ownerEq });
  mocks.ownerEq.mockReturnValue({ eq: mocks.stateEq });
  mocks.stateEq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({
    data: { storage_path: storagePath },
    error: null,
  });
  mocks.storageFrom.mockReturnValue({ remove: mocks.remove });
  mocks.remove.mockResolvedValue({ data: [], error: null });
  mocks.rpc.mockResolvedValue({ data: undefined, error: null });
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

  it("resolves the authenticated owner's reserved path and removes before cancelling", async () => {
    const calls: string[] = [];
    mocks.remove.mockImplementationOnce(async () => {
      calls.push("remove");
      return { data: [], error: null };
    });
    mocks.rpc.mockImplementationOnce(async () => {
      calls.push("cancel");
      return { data: undefined, error: null };
    });

    await expect(
      cancelBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({ status: "cancelled" });

    expect(mocks.requireUser).toHaveBeenCalledWith(`/boards/${boardId}/edit`);
    expect(mocks.idEq).toHaveBeenCalledWith("id", attachmentId);
    expect(mocks.boardEq).toHaveBeenCalledWith("board_id", boardId);
    expect(mocks.ownerEq).toHaveBeenCalledWith("owner_id", ownerId);
    expect(mocks.stateEq).toHaveBeenCalledWith("state", "reserved");
    expect(mocks.remove).toHaveBeenCalledWith([storagePath]);
    expect(mocks.rpc).toHaveBeenCalledWith("cancel_board_image", {
      p_attachment_id: attachmentId,
    });
    expect(calls).toEqual(["remove", "cancel"]);
  });

  it("keeps the reservation when object removal fails and returns a safe error", async () => {
    mocks.remove.mockResolvedValueOnce({
      data: null,
      error: { message: `failed for ${storagePath}` },
    });

    const result = await cancelBoardImage({ boardId, attachmentId });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "error",
      message: "업로드를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain(storagePath);
  });

  it("treats a raced already-cancelled RPC as idempotent after owned resolution", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "image_not_found" },
    });

    await expect(
      cancelBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({ status: "cancelled" });
  });

  it("still cancels the owned row when a prior attempt already removed the object", async () => {
    mocks.remove.mockResolvedValueOnce({
      data: null,
      error: { statusCode: "404", message: "Object not found" },
    });

    await expect(
      cancelBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({ status: "cancelled" });

    expect(mocks.rpc).toHaveBeenCalledWith("cancel_board_image", {
      p_attachment_id: attachmentId,
    });
  });
});
