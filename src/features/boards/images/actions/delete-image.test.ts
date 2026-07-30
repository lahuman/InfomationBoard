import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteBoardImage } from "./delete-image";

const ownerId = "10000000-0000-4000-8000-000000000001";
const boardId = "20000000-0000-4000-8000-000000000002";
const attachmentId = "30000000-0000-4000-8000-000000000003";
const slug = "summer-market";
const storagePath = `${ownerId}/${boardId}/${attachmentId}`;
const imageUrl = `/b/${slug}/images/${attachmentId}`;

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  boardSelect: vi.fn(),
  boardIdEq: vi.fn(),
  boardOwnerEq: vi.fn(),
  boardMaybeSingle: vi.fn(),
  attachmentSelect: vi.fn(),
  attachmentIdEq: vi.fn(),
  attachmentBoardEq: vi.fn(),
  attachmentOwnerEq: vi.fn(),
  attachmentStateIn: vi.fn(),
  attachmentMaybeSingle: vi.fn(),
  profileSelect: vi.fn(),
  profileIdEq: vi.fn(),
  profileSingle: vi.fn(),
  storageFrom: vi.fn(),
  remove: vi.fn(),
  adminRpc: vi.fn(),
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
  createAdminSupabaseClient: vi.fn(() => ({
    rpc: mocks.adminRpc,
    storage: { from: mocks.storageFrom },
  })),
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.calls.length = 0;
  mocks.requireUser.mockResolvedValue({ id: ownerId, email: null });

  mocks.boardSelect.mockReturnValue({ eq: mocks.boardIdEq });
  mocks.boardIdEq.mockReturnValue({ eq: mocks.boardOwnerEq });
  mocks.boardOwnerEq.mockReturnValue({ maybeSingle: mocks.boardMaybeSingle });
  mocks.boardMaybeSingle.mockResolvedValue({
    data: { slug, content_markdown: "# 일정", revision: 7 },
    error: null,
  });

  mocks.attachmentSelect.mockReturnValue({ eq: mocks.attachmentIdEq });
  mocks.attachmentIdEq.mockReturnValue({ eq: mocks.attachmentBoardEq });
  mocks.attachmentBoardEq.mockReturnValue({ eq: mocks.attachmentOwnerEq });
  mocks.attachmentOwnerEq.mockReturnValue({ in: mocks.attachmentStateIn });
  mocks.attachmentStateIn.mockReturnValue({
    maybeSingle: mocks.attachmentMaybeSingle,
  });
  mocks.attachmentMaybeSingle.mockResolvedValue({
    data: {
      id: attachmentId,
      owner_id: ownerId,
      storage_path: storagePath,
      state: "ready",
    },
    error: null,
  });

  mocks.profileSelect.mockReturnValue({ eq: mocks.profileIdEq });
  mocks.profileIdEq.mockReturnValue({ single: mocks.profileSingle });
  mocks.profileSingle.mockResolvedValue({
    data: { storage_bytes: 1024 },
    error: null,
  });

  mocks.from.mockImplementation((table: string) => {
    if (table === "boards") return { select: mocks.boardSelect };
    if (table === "attachments") return { select: mocks.attachmentSelect };
    if (table === "profiles") return { select: mocks.profileSelect };
    throw new Error(`Unexpected table: ${table}`);
  });

  mocks.rpc.mockImplementation(async (name: string) => {
    mocks.calls.push(name);
    return {
      data: [{
        id: attachmentId,
        owner_id: ownerId,
        storage_path: storagePath,
        state: "deleting",
        board_revision: 8,
      }],
      error: null,
    };
  });
  mocks.storageFrom.mockReturnValue({ remove: mocks.remove });
  mocks.remove.mockImplementation(async () => {
    mocks.calls.push("remove");
    return { data: [], error: null };
  });
  mocks.adminRpc.mockImplementation(async (name: string) => {
    mocks.calls.push(name);
    return { data: undefined, error: null };
  });
});

describe("deleteBoardImage", () => {
  it("rejects invalid identifiers before authentication", async () => {
    await expect(
      deleteBoardImage({ boardId: "not-a-uuid", attachmentId }),
    ).resolves.toEqual({
      status: "error",
      message: "이미지를 삭제하지 못했습니다.",
    });
    await expect(
      deleteBoardImage({ boardId, attachmentId: "not-a-uuid" }),
    ).resolves.toEqual({
      status: "error",
      message: "이미지를 삭제하지 못했습니다.",
    });

    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns the same safe error for a foreign or missing image", async () => {
    mocks.attachmentMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    await expect(
      deleteBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({
      status: "error",
      message: "이미지를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });

    expect(mocks.attachmentOwnerEq).toHaveBeenCalledWith("owner_id", ownerId);
    expect(mocks.attachmentStateIn).toHaveBeenCalledWith("state", [
      "ready",
      "deleting",
    ]);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("blocks an exact saved Markdown image node before claiming or removing", async () => {
    mocks.boardMaybeSingle.mockResolvedValueOnce({
      data: {
        slug,
        content_markdown: `# 포스터\n\n![여름 행사](${imageUrl})`,
        revision: 7,
      },
      error: null,
    });

    await expect(
      deleteBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({
      status: "in_use",
      message: "본문에서 이 이미지를 먼저 제거하고 저장해 주세요.",
    });

    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it.each([
    ["plain text", `이미지 주소: ${imageUrl}`],
    ["ordinary link", `[이미지 보기](${imageUrl})`],
  ])("does not block the same URL in %s", async (_label, contentMarkdown) => {
    mocks.boardMaybeSingle.mockResolvedValueOnce({
      data: { slug, content_markdown: contentMarkdown, revision: 7 },
      error: null,
    });

    await expect(
      deleteBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({
      status: "deleted",
      storageBytes: 1024,
      boardRevision: 8,
    });
  });

  it("claims before Storage removal and completes only through the admin client", async () => {
    await expect(
      deleteBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({
      status: "deleted",
      storageBytes: 1024,
      boardRevision: 8,
    });

    expect(mocks.rpc).toHaveBeenCalledWith("claim_board_image_deletion", {
      p_board_id: boardId,
      p_attachment_id: attachmentId,
      p_board_revision: 7,
    });
    expect(mocks.storageFrom).toHaveBeenCalledWith("board-images");
    expect(mocks.remove).toHaveBeenCalledWith([storagePath]);
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      "complete_board_image_deletion",
      {
        p_owner_id: ownerId,
        p_board_id: boardId,
        p_attachment_id: attachmentId,
      },
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.calls).toEqual([
      "claim_board_image_deletion",
      "remove",
      "complete_board_image_deletion",
    ]);
  });

  it("treats only the exact missing-object response as removable", async () => {
    mocks.remove.mockResolvedValueOnce({
      data: null,
      error: {
        name: "StorageApiError",
        status: 404,
        message: "Object not found",
      },
    });

    await expect(
      deleteBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({
      status: "deleted",
      storageBytes: 1024,
      boardRevision: 8,
    });
    expect(mocks.adminRpc).toHaveBeenCalledTimes(1);
  });

  it("leaves the deleting metadata and quota for retry when Storage removal fails", async () => {
    mocks.remove.mockResolvedValueOnce({
      data: null,
      error: {
        name: "StorageApiError",
        status: 503,
        message: "Unavailable",
      },
    });

    await expect(
      deleteBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({
      status: "error",
      message: "이미지를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      boardRevision: 8,
    });

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.adminRpc).not.toHaveBeenCalled();
    expect(mocks.profileSingle).not.toHaveBeenCalled();
  });

  it("returns a safe retryable error when trusted completion fails", async () => {
    mocks.adminRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "sensitive database details" },
    });

    const result = await deleteBoardImage({ boardId, attachmentId });

    expect(result).toEqual({
      status: "error",
      message: "이미지를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      boardRevision: 8,
    });
    expect(JSON.stringify(result)).not.toContain("sensitive");
    expect(mocks.profileSingle).not.toHaveBeenCalled();
  });

  it("keeps the irreversible deleted result when usage refresh fails after completion", async () => {
    mocks.profileSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "unavailable" },
    });

    await expect(
      deleteBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({
      status: "deleted",
      boardRevision: 8,
    });
  });

  it("recovers the committed revision when the claim response throws ambiguously", async () => {
    mocks.boardMaybeSingle
      .mockResolvedValueOnce({
        data: { slug, content_markdown: "# 일정", revision: 7 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { slug, content_markdown: "# 일정", revision: 8 },
        error: null,
      });
    mocks.attachmentMaybeSingle
      .mockResolvedValueOnce({
        data: {
          id: attachmentId,
          owner_id: ownerId,
          storage_path: storagePath,
          state: "ready",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: attachmentId,
          owner_id: ownerId,
          storage_path: storagePath,
          state: "deleting",
        },
        error: null,
      });
    mocks.rpc.mockRejectedValueOnce(new Error("connection reset"));

    await expect(
      deleteBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({
      status: "error",
      message: "이미지를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      boardRevision: 8,
    });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("recovers a concurrently completed deletion from a malformed claim response", async () => {
    mocks.boardMaybeSingle
      .mockResolvedValueOnce({
        data: { slug, content_markdown: "# 일정", revision: 7 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { slug, content_markdown: "# 일정", revision: 8 },
        error: null,
      });
    mocks.attachmentMaybeSingle
      .mockResolvedValueOnce({
        data: {
          id: attachmentId,
          owner_id: ownerId,
          storage_path: storagePath,
          state: "ready",
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });

    await expect(
      deleteBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({
      status: "deleted",
      boardRevision: 8,
    });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("re-reads authoritative state when a claim response mismatches the requested path", async () => {
    mocks.boardMaybeSingle
      .mockResolvedValueOnce({
        data: { slug, content_markdown: "# 일정", revision: 7 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { slug, content_markdown: "# 일정", revision: 8 },
        error: null,
      });
    mocks.attachmentMaybeSingle
      .mockResolvedValueOnce({
        data: {
          id: attachmentId,
          owner_id: ownerId,
          storage_path: storagePath,
          state: "ready",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: attachmentId,
          owner_id: ownerId,
          storage_path: storagePath,
          state: "deleting",
        },
        error: null,
      });
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        id: attachmentId,
        owner_id: ownerId,
        storage_path: `${storagePath}-wrong`,
        state: "deleting",
        board_revision: 8,
      }],
      error: null,
    });

    await expect(
      deleteBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({
      status: "error",
      message: "이미지를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      boardRevision: 8,
    });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("does not remove when the saved board revision changed before the claim", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "image_board_changed" },
    });

    await expect(
      deleteBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({
      status: "error",
      message: "이미지를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });

    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it("revalidates editor, dashboard, public board, and image paths after deletion", async () => {
    await deleteBoardImage({ boardId, attachmentId });

    expect(mocks.revalidatePath.mock.calls).toEqual([
      [`/boards/${boardId}/edit`],
      ["/dashboard"],
      [`/b/${slug}`],
      [imageUrl],
    ]);
  });
});
