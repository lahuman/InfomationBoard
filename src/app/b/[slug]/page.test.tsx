import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicBoardPage, { generateMetadata } from "./page";

const mocks = vi.hoisted(() => ({
  getPublicBoardBySlug: vi.fn(),
  getPasswordBoardBySlug: vi.fn(),
  verifyAccessToken: vi.fn(),
  cookieGet: vi.fn(),
  noStore: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/features/boards/public/queries", () => ({
  getPublicBoardBySlug: mocks.getPublicBoardBySlug,
}));

vi.mock("@/features/boards/access/password-board", () => ({
  getPasswordBoardBySlug: mocks.getPasswordBoardBySlug,
}));

vi.mock("@/features/boards/access/access-cookie", () => ({
  ACCESS_COOKIE_NAME: "ib_board_access",
  verifyAccessToken: mocks.verifyAccessToken,
}));

vi.mock("@/features/boards/access/verify-password", () => ({
  verifyPasswordAccess: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({ SUPABASE_SECRET_KEY: "server-secret" }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet })),
}));

vi.mock("next/cache", () => ({
  unstable_noStore: mocks.noStore,
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
  mocks.getPasswordBoardBySlug.mockResolvedValue(null);
  mocks.verifyAccessToken.mockReturnValue(false);
  mocks.cookieGet.mockReturnValue(undefined);
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

  it("shows a non-cacheable challenge before password authorization", async () => {
    mocks.getPublicBoardBySlug.mockResolvedValue(null);
    mocks.getPasswordBoardBySlug.mockResolvedValue({
      board: { ...board, allowIndexing: false },
      passwordHash: "$argon2id$server-only-hash",
      secretVersion: "2026-07-28T11:30:00.000Z",
    });

    render(
      await PublicBoardPage({
        params: Promise.resolve({ slug: board.slug }),
      }),
    );

    expect(mocks.noStore).toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "비밀번호가 필요한 안내판입니다." }),
    ).toBeVisible();
    expect(screen.queryByText(board.summary)).not.toBeInTheDocument();
  });

  it("renders protected content only with a valid scoped cookie", async () => {
    mocks.getPublicBoardBySlug.mockResolvedValue(null);
    mocks.getPasswordBoardBySlug.mockResolvedValue({
      board: { ...board, allowIndexing: false },
      passwordHash: "$argon2id$server-only-hash",
      secretVersion: "2026-07-28T11:30:00.000Z",
    });
    mocks.cookieGet.mockReturnValue({ value: "signed-token" });
    mocks.verifyAccessToken.mockReturnValue(true);

    render(
      await PublicBoardPage({
        params: Promise.resolve({ slug: board.slug }),
      }),
    );

    expect(mocks.verifyAccessToken).toHaveBeenCalledWith(
      "signed-token",
      {
        boardId: board.id,
        secretVersion: "2026-07-28T11:30:00.000Z",
      },
      "server-secret",
    );
    expect(screen.getByText(board.summary)).toBeVisible();
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

  it("keeps password challenges generic and non-indexable", async () => {
    mocks.getPublicBoardBySlug.mockResolvedValue(null);
    mocks.getPasswordBoardBySlug.mockResolvedValue({
      board: { ...board, allowIndexing: false },
      passwordHash: "$argon2id$server-only-hash",
      secretVersion: "2026-07-28T11:30:00.000Z",
    });

    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: board.slug }),
      }),
    ).resolves.toEqual({
      title: "비밀번호로 보호된 안내판",
      alternates: { canonical: `/b/${board.slug}` },
      robots: { index: false, follow: false },
    });
  });
});
