import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPasswordBoardBySlug } from "./password-board";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({
    data: [
      {
        board_id: "53000000-0000-4000-8000-000000000001",
        slug: "locked-board",
        title: "잠긴 안내판",
        summary: "비밀번호가 필요합니다.",
        content_markdown: "# 보호된 내용",
        template: "meeting",
        theme: {
          palette: "blue",
          density: "compact",
          alignment: "center",
        },
        updated_at: "2026-07-28T12:00:00.000Z",
        published_at: "2026-07-28T11:00:00.000Z",
        password_hash: "$argon2id$server-only-hash",
        secret_version: "2026-07-28T11:30:00.000Z",
      },
    ],
    error: null,
  });
});

describe("getPasswordBoardBySlug", () => {
  it("maps the service-only RPC into content and verification data", async () => {
    const result = await getPasswordBoardBySlug("locked-board");

    expect(mocks.rpc).toHaveBeenCalledWith(
      "get_password_board_for_server",
      { p_slug: "locked-board" },
    );
    expect(result).toEqual({
      board: {
        id: "53000000-0000-4000-8000-000000000001",
        slug: "locked-board",
        title: "잠긴 안내판",
        summary: "비밀번호가 필요합니다.",
        contentMarkdown: "# 보호된 내용",
        template: "meeting",
        theme: {
          palette: "blue",
          density: "compact",
          alignment: "center",
        },
        allowIndexing: false,
        updatedAt: "2026-07-28T12:00:00.000Z",
        publishedAt: "2026-07-28T11:00:00.000Z",
      },
      passwordHash: "$argon2id$server-only-hash",
      secretVersion: "2026-07-28T11:30:00.000Z",
    });
  });

  it("returns null for invalid, hidden, or malformed data", async () => {
    await expect(getPasswordBoardBySlug("../private")).resolves.toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(getPasswordBoardBySlug("missing-board")).resolves.toBeNull();

    mocks.rpc.mockResolvedValueOnce({ data: [{ title: "bad" }], error: null });
    await expect(getPasswordBoardBySlug("broken-board")).resolves.toBeNull();
  });
});
