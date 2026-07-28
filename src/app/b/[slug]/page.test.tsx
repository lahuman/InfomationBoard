import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicBoardPage, { generateMetadata } from "./page";

const mocks = vi.hoisted(() => ({
  getPublicBoardBySlug: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/features/boards/public/queries", () => ({
  getPublicBoardBySlug: mocks.getPublicBoardBySlug,
}));

const board = {
  id: "30000000-0000-4000-8000-000000000003",
  slug: "summer-night-market",
  title: "여름 야시장",
  summary: "한여름 밤의 먹거리와 공연을 만나보세요.",
  contentMarkdown: "## 운영 시간\n\n금요일 오후 6시",
  template: "event" as const,
  theme: {
    palette: "coral" as const,
    density: "comfortable" as const,
    alignment: "left" as const,
  },
  allowIndexing: true,
  updatedAt: "2026-07-28T10:00:00.000Z",
  publishedAt: "2026-07-28T09:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPublicBoardBySlug.mockResolvedValue(board);
  mocks.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

describe("PublicBoardPage", () => {
  it("renders an anonymously visible board", async () => {
    render(
      await PublicBoardPage({
        params: Promise.resolve({ slug: board.slug }),
      }),
    );

    expect(mocks.getPublicBoardBySlug).toHaveBeenCalledWith(board.slug);
    expect(
      screen.getByRole("heading", { name: board.title, level: 1 }),
    ).toBeVisible();
  });

  it("uses the same not-found response for every unavailable board", async () => {
    mocks.getPublicBoardBySlug.mockResolvedValue(null);

    await expect(
      PublicBoardPage({
        params: Promise.resolve({ slug: "private-or-missing" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("generateMetadata", () => {
  it("builds canonical, Open Graph, and indexable metadata", async () => {
    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: board.slug }),
      }),
    ).resolves.toEqual({
      title: board.title,
      description: board.summary,
      alternates: { canonical: `/b/${board.slug}` },
      openGraph: {
        type: "article",
        title: board.title,
        description: board.summary,
        url: `/b/${board.slug}`,
        publishedTime: board.publishedAt,
        modifiedTime: board.updatedAt,
      },
      robots: { index: true, follow: true },
    });
  });

  it("prevents indexing when the owner disables it", async () => {
    mocks.getPublicBoardBySlug.mockResolvedValue({
      ...board,
      allowIndexing: false,
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: board.slug }),
    });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("does not expose details for an unavailable board", async () => {
    mocks.getPublicBoardBySlug.mockResolvedValue(null);

    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: "private-or-missing" }),
      }),
    ).resolves.toEqual({
      title: "안내판을 찾을 수 없습니다",
      robots: { index: false, follow: false },
    });
  });
});
