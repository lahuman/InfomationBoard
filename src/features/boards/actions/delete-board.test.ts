import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteBoard } from "./delete-board";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  attachmentsSelect: vi.fn(),
  attachmentsBoardEq: vi.fn(),
  attachmentsOwnerEq: vi.fn(),
  storageFrom: vi.fn(),
  remove: vi.fn(),
  adminRpc: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

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
  createAdminSupabaseClient: mocks.createAdminClient,
}));

const boardId = "30000000-0000-4000-8000-000000000003";
const ownerId = "10000000-0000-4000-8000-000000000001";
const slug = "summer-market";
const firstPath = `${ownerId}/${boardId}/40000000-0000-4000-8000-000000000004`;
const secondPath = `${ownerId}/${boardId}/50000000-0000-4000-8000-000000000005`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  mocks.requireUser.mockResolvedValue({
    id: ownerId,
    email: null,
  });
  mocks.rpc.mockImplementation(async (name: string) => {
    mocks.calls.push(name);
    return {
      data: [{ id: boardId, owner_id: ownerId, slug }],
      error: null,
    };
  });
  mocks.attachmentsSelect.mockReturnValue({ eq: mocks.attachmentsBoardEq });
  mocks.attachmentsBoardEq.mockReturnValue({ eq: mocks.attachmentsOwnerEq });
  mocks.attachmentsOwnerEq.mockImplementation(async () => {
    mocks.calls.push("attachments");
    return {
      data: [{ storage_path: firstPath }, { storage_path: secondPath }],
      error: null,
    };
  });
  mocks.from.mockImplementation((table: string) => {
    if (table === "attachments") return { select: mocks.attachmentsSelect };
    throw new Error(`Unexpected table: ${table}`);
  });
  mocks.storageFrom.mockReturnValue({ remove: mocks.remove });
  mocks.createAdminClient.mockReturnValue({
    rpc: mocks.adminRpc,
    storage: { from: mocks.storageFrom },
  });
  mocks.remove.mockImplementation(async () => {
    mocks.calls.push("remove");
    return { data: [], error: null };
  });
  mocks.adminRpc.mockImplementation(async (name: string) => {
    mocks.calls.push(name);
    return { data: undefined, error: null };
  });
});

describe("deleteBoard", () => {
  it("claims the authenticated owner's board and completes through the admin client", async () => {
    await expect(deleteBoard({ id: boardId })).resolves.toEqual({
      status: "deleted",
    });

    expect(mocks.requireUser).toHaveBeenCalledWith(
      `/boards/${boardId}/edit`,
    );
    expect(mocks.rpc).toHaveBeenCalledWith("claim_board_deletion", {
      p_board_id: boardId,
    });
    expect(mocks.attachmentsBoardEq).toHaveBeenCalledWith("board_id", boardId);
    expect(mocks.attachmentsOwnerEq).toHaveBeenCalledWith("owner_id", ownerId);
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      "complete_board_deletion",
      {
        p_owner_id: ownerId,
        p_board_id: boardId,
      },
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/dashboard"],
      [`/b/${slug}`],
    ]);
  });

  it("uses the same successful outcome for a missing or foreign board", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });

    await expect(deleteBoard({ id: boardId })).resolves.toEqual({
      status: "deleted",
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it("rejects an invalid identifier before authentication", async () => {
    await expect(deleteBoard({ id: "not-a-uuid" })).resolves.toEqual({
      status: "error",
      message: "안내판을 삭제하지 못했습니다.",
    });

    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("removes all server-resolved attachment paths in one batch before database completion", async () => {
    await expect(deleteBoard({ id: boardId })).resolves.toEqual({
      status: "deleted",
    });

    expect(mocks.storageFrom).toHaveBeenCalledWith("board-images");
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith([firstPath, secondPath]);
    expect(mocks.calls).toEqual([
      "claim_board_deletion",
      "attachments",
      "remove",
      "complete_board_deletion",
    ]);
  });

  it("skips Storage for a board without attachments", async () => {
    mocks.attachmentsOwnerEq.mockResolvedValueOnce({ data: [], error: null });

    await expect(deleteBoard({ id: boardId })).resolves.toEqual({
      status: "deleted",
    });

    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.adminRpc).toHaveBeenCalledTimes(1);
  });

  it("keeps the claimed board and metadata when Storage removal fails", async () => {
    mocks.remove.mockResolvedValueOnce({
      data: null,
      error: { name: "StorageApiError", status: 503, message: "Unavailable" },
    });

    await expect(deleteBoard({ id: boardId })).resolves.toEqual({
      status: "error",
      message: "안내판을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });

    expect(mocks.adminRpc).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a safe error when the admin client cannot be created", async () => {
    mocks.createAdminClient.mockImplementationOnce(() => {
      throw new Error("sensitive environment details");
    });

    await expect(deleteBoard({ id: boardId })).resolves.toEqual({
      status: "error",
      message: "안내판을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });

    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it("does not treat a batched missing-object error as proof every path was removed", async () => {
    mocks.remove.mockResolvedValueOnce({
      data: null,
      error: {
        name: "StorageApiError",
        status: 404,
        message: "Object not found",
      },
    });

    await expect(deleteBoard({ id: boardId })).resolves.toEqual({
      status: "error",
      message: "안내판을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it("returns a safe retryable error when database completion fails after removal", async () => {
    mocks.adminRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "sensitive database policy details" },
    });

    const result = await deleteBoard({ id: boardId });

    expect(result).toEqual({
      status: "error",
      message: "안내판을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("sensitive");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });

  it("returns a safe error when attachment path resolution fails", async () => {
    mocks.attachmentsOwnerEq.mockResolvedValueOnce({
      data: null,
      error: { message: "sensitive attachment policy details" },
    });

    const result = await deleteBoard({ id: boardId });

    expect(result).toEqual({
      status: "error",
      message: "안내판을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("sensitive");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });
});
