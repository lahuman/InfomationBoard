import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBoardForEditor } from "./queries";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eqId: vi.fn(),
  eqOwner: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: mocks.from,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eqId });
  mocks.eqId.mockReturnValue({ eq: mocks.eqOwner });
  mocks.eqOwner.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({
    data: {
      id: "30000000-0000-4000-8000-000000000003",
      title: "여름 야시장",
      summary: "행사 요약",
      content_markdown: "# 안내",
      template: "event",
      theme: {
        palette: "coral",
        density: "comfortable",
        alignment: "left",
      },
      revision: 2,
      updated_at: "2026-07-28T10:00:00.000Z",
    },
    error: null,
  });
});

describe("getBoardForEditor", () => {
  it("loads one board scoped to its authenticated owner", async () => {
    await expect(
      getBoardForEditor(
        "owner-id",
        "30000000-0000-4000-8000-000000000003",
      ),
    ).resolves.toEqual({
      id: "30000000-0000-4000-8000-000000000003",
      title: "여름 야시장",
      summary: "행사 요약",
      contentMarkdown: "# 안내",
      template: "event",
      theme: {
        palette: "coral",
        density: "comfortable",
        alignment: "left",
      },
      revision: 2,
      updatedAt: "2026-07-28T10:00:00.000Z",
    });
    expect(mocks.from).toHaveBeenCalledWith("boards");
    expect(mocks.eqId).toHaveBeenCalledWith(
      "id",
      "30000000-0000-4000-8000-000000000003",
    );
    expect(mocks.eqOwner).toHaveBeenCalledWith("owner_id", "owner-id");
  });

  it("returns null for missing, invalid, or foreign board IDs", async () => {
    await expect(getBoardForEditor("owner-id", "not-a-uuid")).resolves.toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();

    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(
      getBoardForEditor(
        "owner-id",
        "30000000-0000-4000-8000-000000000003",
      ),
    ).resolves.toBeNull();
  });
});

