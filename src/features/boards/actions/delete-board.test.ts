import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteBoard } from "./delete-board";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  from: vi.fn(),
  delete: vi.fn(),
  eqId: vi.fn(),
  eqOwner: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/features/auth/require-user", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: mocks.from,
  })),
}));

const boardId = "30000000-0000-4000-8000-000000000003";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    id: "10000000-0000-4000-8000-000000000001",
    email: null,
  });
  mocks.from.mockReturnValue({ delete: mocks.delete });
  mocks.delete.mockReturnValue({ eq: mocks.eqId });
  mocks.eqId.mockReturnValue({ eq: mocks.eqOwner });
  mocks.eqOwner.mockResolvedValue({ error: null });
});

describe("deleteBoard", () => {
  it("deletes only the authenticated owner's board", async () => {
    await expect(deleteBoard({ id: boardId })).resolves.toEqual({
      status: "deleted",
    });

    expect(mocks.requireUser).toHaveBeenCalledWith(
      `/boards/${boardId}/edit`,
    );
    expect(mocks.from).toHaveBeenCalledWith("boards");
    expect(mocks.eqId).toHaveBeenCalledWith("id", boardId);
    expect(mocks.eqOwner).toHaveBeenCalledWith(
      "owner_id",
      "10000000-0000-4000-8000-000000000001",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("uses the same successful outcome for a missing or foreign board", async () => {
    mocks.eqOwner.mockResolvedValue({ error: null });

    await expect(deleteBoard({ id: boardId })).resolves.toEqual({
      status: "deleted",
    });
  });

  it("rejects an invalid identifier before authentication", async () => {
    await expect(deleteBoard({ id: "not-a-uuid" })).resolves.toEqual({
      status: "error",
      message: "안내판을 삭제하지 못했습니다.",
    });

    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("returns a safe error without database details", async () => {
    mocks.eqOwner.mockResolvedValue({
      error: { message: "sensitive database policy details" },
    });

    const result = await deleteBoard({ id: boardId });

    expect(result).toEqual({
      status: "error",
      message: "안내판을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("sensitive");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
