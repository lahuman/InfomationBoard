import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicBoardBySlug } from "./queries";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/public", () => ({
  createPublicSupabaseClient: vi.fn(() => ({
    from: mocks.from,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({
    data: {
      id: "30000000-0000-4000-8000-000000000003",
      slug: "summer-night-market",
      title: "여름 야시장",
      summary: "행사 요약",
      content_markdown: "# 안내",
      template: "event",
      theme: {
        palette: "coral",
        density: "comfortable",
        alignment: "left",
      },
      allow_indexing: true,
      updated_at: "2026-07-28T10:00:00.000Z",
      published_at: "2026-07-28T09:00:00.000Z",
    },
    error: null,
  });
});

describe("getPublicBoardBySlug", () => {
  it("loads only the safe anonymous board projection", async () => {
    await expect(
      getPublicBoardBySlug("summer-night-market"),
    ).resolves.toEqual({
      id: "30000000-0000-4000-8000-000000000003",
      slug: "summer-night-market",
      title: "여름 야시장",
      summary: "행사 요약",
      contentMarkdown: "# 안내",
      template: "event",
      theme: {
        palette: "coral",
        density: "comfortable",
        alignment: "left",
      },
      allowIndexing: true,
      updatedAt: "2026-07-28T10:00:00.000Z",
      publishedAt: "2026-07-28T09:00:00.000Z",
    });

    expect(mocks.from).toHaveBeenCalledWith("boards");
    expect(mocks.select).toHaveBeenCalledWith(
      "id, slug, title, summary, content_markdown, template, theme, allow_indexing, updated_at, published_at",
    );
    expect(mocks.eq).toHaveBeenCalledWith("slug", "summer-night-market");
  });

  it("returns null before querying for an invalid slug", async () => {
    await expect(getPublicBoardBySlug("../private")).resolves.toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns null when RLS hides the board or the row is invalid", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      getPublicBoardBySlug("private-board"),
    ).resolves.toBeNull();

    mocks.maybeSingle.mockResolvedValueOnce({
      data: { title: "incomplete" },
      error: null,
    });
    await expect(getPublicBoardBySlug("broken-board")).resolves.toBeNull();
  });
});
