import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateBoard } from "./update-board";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  updateEqId: vi.fn(),
  updateEqOwner: vi.fn(),
  updateEqRevision: vi.fn(),
  updateSelect: vi.fn(),
  updateMaybeSingle: vi.fn(),
  conflictSelect: vi.fn(),
  conflictEqId: vi.fn(),
  conflictEqOwner: vi.fn(),
  conflictMaybeSingle: vi.fn(),
}));

vi.mock("@/features/auth/require-user", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: mocks.from,
  })),
}));

const input = {
  id: "30000000-0000-4000-8000-000000000003",
  revision: 2,
  title: "수정한 행사",
  summary: "수정한 요약",
  contentMarkdown: "# 수정",
  theme: {
    palette: "coral" as const,
    density: "comfortable" as const,
    alignment: "left" as const,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    id: "10000000-0000-4000-8000-000000000001",
    email: null,
  });

  mocks.update.mockReturnValue({ eq: mocks.updateEqId });
  mocks.updateEqId.mockReturnValue({ eq: mocks.updateEqOwner });
  mocks.updateEqOwner.mockReturnValue({ eq: mocks.updateEqRevision });
  mocks.updateEqRevision.mockReturnValue({ select: mocks.updateSelect });
  mocks.updateSelect.mockReturnValue({
    maybeSingle: mocks.updateMaybeSingle,
  });

  mocks.conflictSelect.mockReturnValue({ eq: mocks.conflictEqId });
  mocks.conflictEqId.mockReturnValue({ eq: mocks.conflictEqOwner });
  mocks.conflictEqOwner.mockReturnValue({
    maybeSingle: mocks.conflictMaybeSingle,
  });

  mocks.from.mockImplementation(() => ({
    update: mocks.update,
    select: mocks.conflictSelect,
  }));
  mocks.updateMaybeSingle.mockResolvedValue({
    data: {
      revision: 3,
      updated_at: "2026-07-28T10:01:00.000Z",
    },
    error: null,
  });
});

describe("updateBoard", () => {
  it("updates the owner draft only at the expected revision", async () => {
    await expect(updateBoard(input)).resolves.toEqual({
      status: "saved",
      revision: 3,
      updatedAt: "2026-07-28T10:01:00.000Z",
    });

    expect(mocks.requireUser).toHaveBeenCalledWith(
      "/boards/30000000-0000-4000-8000-000000000003/edit",
    );
    expect(mocks.update).toHaveBeenCalledWith({
      title: input.title,
      summary: input.summary,
      content_markdown: input.contentMarkdown,
      theme: input.theme,
    });
    expect(mocks.updateEqOwner).toHaveBeenCalledWith(
      "owner_id",
      "10000000-0000-4000-8000-000000000001",
    );
    expect(mocks.updateEqRevision).toHaveBeenCalledWith("revision", 2);
  });

  it("returns the current owner draft on a stale revision conflict", async () => {
    mocks.updateMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    mocks.conflictMaybeSingle.mockResolvedValue({
      data: {
        id: input.id,
        title: "서버의 최신 행사",
        summary: "서버 요약",
        content_markdown: "# 서버",
        template: "event",
        theme: input.theme,
        revision: 4,
        updated_at: "2026-07-28T10:02:00.000Z",
      },
      error: null,
    });

    await expect(updateBoard(input)).resolves.toMatchObject({
      status: "conflict",
      serverBoard: {
        title: "서버의 최신 행사",
        revision: 4,
      },
    });
  });

  it("returns not found without revealing a foreign board", async () => {
    mocks.updateMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    mocks.conflictMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(updateBoard(input)).resolves.toEqual({
      status: "not_found",
      message: "안내판을 찾을 수 없습니다.",
    });
  });

  it("rejects invalid input before authentication", async () => {
    await expect(updateBoard({ ...input, revision: 0 })).resolves.toEqual({
      status: "error",
      message: "저장할 내용을 확인해 주세요.",
    });
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });
});

