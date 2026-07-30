import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeliverableBoardImage } from "./delivery";

const ownerId = "10000000-0000-4000-8000-000000000001";
const boardId = "20000000-0000-4000-8000-000000000002";
const attachmentId = "30000000-0000-4000-8000-000000000003";
const slug = "summer-market";
const storagePath = `${ownerId}/${boardId}/${attachmentId}`;

function createQueryMock() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  return query;
}

const mocks = vi.hoisted(() => {
  const ownerQuery = createQueryMock();
  const adminQuery = createQueryMock();

  return {
    ownerQuery,
    adminQuery,
    getClaims: vi.fn(),
    serverFrom: vi.fn(),
    adminFrom: vi.fn(),
    getPublicBoardBySlug: vi.fn(),
    getPasswordBoardBySlug: vi.fn(),
    cookies: vi.fn(),
    cookieGet: vi.fn(),
    verifyAccessToken: vi.fn(),
    getServerEnv: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getClaims: mocks.getClaims },
    from: mocks.serverFrom,
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({ from: mocks.adminFrom })),
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
vi.mock("@/lib/env/server", () => ({
  getServerEnv: mocks.getServerEnv,
}));

function attachmentRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: attachmentId,
    board_id: boardId,
    owner_id: ownerId,
    storage_path: storagePath,
    mime_type: "image/png",
    size_bytes: 8,
    state: "ready",
    boards: {
      id: boardId,
      slug,
      owner_id: ownerId,
      deletion_started_at: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ownerQuery.maybeSingle.mockResolvedValue({
    data: null,
    error: null,
  });
  mocks.adminQuery.maybeSingle.mockResolvedValue({
    data: attachmentRow(),
    error: null,
  });
  mocks.serverFrom.mockReturnValue(mocks.ownerQuery);
  mocks.adminFrom.mockReturnValue(mocks.adminQuery);
  mocks.getClaims.mockResolvedValue({
    data: { claims: null },
    error: null,
  });
  mocks.getPublicBoardBySlug.mockResolvedValue(null);
  mocks.getPasswordBoardBySlug.mockResolvedValue(null);
  mocks.cookies.mockResolvedValue({ get: mocks.cookieGet });
  mocks.cookieGet.mockReturnValue(undefined);
  mocks.verifyAccessToken.mockReturnValue(false);
  mocks.getServerEnv.mockReturnValue({
    SUPABASE_SECRET_KEY: "server-secret",
  });
});

describe("getDeliverableBoardImage", () => {
  it("rejects malformed route identifiers before creating clients", async () => {
    await expect(
      getDeliverableBoardImage("Summer Market", attachmentId),
    ).resolves.toBeNull();
    await expect(
      getDeliverableBoardImage(slug, "not-a-uuid"),
    ).resolves.toBeNull();

    expect(mocks.getClaims).not.toHaveBeenCalled();
    expect(mocks.getPublicBoardBySlug).not.toHaveBeenCalled();
  });

  it("allows an authenticated owner to load a ready image from a draft private board", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: ownerId } },
      error: null,
    });
    mocks.ownerQuery.maybeSingle.mockResolvedValue({
      data: attachmentRow(),
      error: null,
    });

    await expect(
      getDeliverableBoardImage(slug, attachmentId),
    ).resolves.toEqual({
      storagePath,
      mimeType: "image/png",
      sizeBytes: 8,
    });

    expect(mocks.ownerQuery.eq).toHaveBeenCalledWith("id", attachmentId);
    expect(mocks.ownerQuery.eq).toHaveBeenCalledWith("owner_id", ownerId);
    expect(mocks.ownerQuery.eq).toHaveBeenCalledWith("state", "ready");
    expect(mocks.ownerQuery.eq).toHaveBeenCalledWith("boards.slug", slug);
    expect(mocks.ownerQuery.is).toHaveBeenCalledWith(
      "boards.deletion_started_at",
      null,
    );
    expect(mocks.getPublicBoardBySlug).not.toHaveBeenCalled();
    expect(mocks.getPasswordBoardBySlug).not.toHaveBeenCalled();
  });

  it.each([
    ["non-ready attachment", { state: "deleting" }],
    [
      "deleting parent board",
      {
        boards: {
          id: boardId,
          slug,
          owner_id: ownerId,
          deletion_started_at: "2026-07-30T00:00:00.000Z",
        },
      },
    ],
    [
      "foreign slug",
      {
        boards: {
          id: boardId,
          slug: "other-board",
          owner_id: ownerId,
          deletion_started_at: null,
        },
      },
    ],
  ])("rejects an owner row for a %s", async (_label, overrides) => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: ownerId } },
      error: null,
    });
    mocks.ownerQuery.maybeSingle.mockResolvedValue({
      data: attachmentRow(overrides),
      error: null,
    });

    await expect(
      getDeliverableBoardImage(slug, attachmentId),
    ).resolves.toBeNull();
  });

  it("allows anonymous access to an exact image on a published public board", async () => {
    mocks.getPublicBoardBySlug.mockResolvedValue({
      id: boardId,
      slug,
    });

    await expect(
      getDeliverableBoardImage(slug, attachmentId),
    ).resolves.toEqual({
      storagePath,
      mimeType: "image/png",
      sizeBytes: 8,
    });

    expect(mocks.adminQuery.eq).toHaveBeenCalledWith("id", attachmentId);
    expect(mocks.adminQuery.eq).toHaveBeenCalledWith("board_id", boardId);
    expect(mocks.adminQuery.eq).toHaveBeenCalledWith("state", "ready");
    expect(mocks.adminQuery.eq).toHaveBeenCalledWith("boards.slug", slug);
    expect(mocks.adminQuery.is).toHaveBeenCalledWith(
      "boards.deletion_started_at",
      null,
    );
    expect(mocks.getPasswordBoardBySlug).not.toHaveBeenCalled();
  });

  it("allows a published password board only with its valid access cookie", async () => {
    mocks.getPasswordBoardBySlug.mockResolvedValue({
      board: { id: boardId, slug },
      passwordHash: "$argon2id$not-used-for-cookie-check",
      secretVersion: "secret-version",
    });
    mocks.cookieGet.mockReturnValue({ value: "valid-token" });
    mocks.verifyAccessToken.mockReturnValue(true);

    await expect(
      getDeliverableBoardImage(slug, attachmentId),
    ).resolves.toEqual({
      storagePath,
      mimeType: "image/png",
      sizeBytes: 8,
    });

    expect(mocks.cookieGet).toHaveBeenCalledWith("ib_board_access");
    expect(mocks.verifyAccessToken).toHaveBeenCalledWith(
      "valid-token",
      { boardId, secretVersion: "secret-version" },
      "server-secret",
    );
  });

  it.each([
    ["missing", undefined],
    ["invalid", { value: "invalid-token" }],
  ])("denies a password board with a %s cookie", async (_label, cookie) => {
    mocks.getPasswordBoardBySlug.mockResolvedValue({
      board: { id: boardId, slug },
      passwordHash: "$argon2id$not-used-for-cookie-check",
      secretVersion: "secret-version",
    });
    mocks.cookieGet.mockReturnValue(cookie);
    mocks.verifyAccessToken.mockReturnValue(false);

    await expect(
      getDeliverableBoardImage(slug, attachmentId),
    ).resolves.toBeNull();

    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it("denies anonymous access to a draft or private board", async () => {
    await expect(
      getDeliverableBoardImage(slug, attachmentId),
    ).resolves.toBeNull();

    expect(mocks.getPublicBoardBySlug).toHaveBeenCalledWith(slug);
    expect(mocks.getPasswordBoardBySlug).toHaveBeenCalledWith(slug);
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it.each([
    ["attachment", { id: "40000000-0000-4000-8000-000000000004" }],
    ["board", { board_id: "40000000-0000-4000-8000-000000000004" }],
    [
      "slug",
      {
        boards: {
          id: boardId,
          slug: "foreign-board",
          owner_id: ownerId,
          deletion_started_at: null,
        },
      },
    ],
  ])("rejects an admin lookup returning a foreign %s", async (
    _label,
    overrides,
  ) => {
    mocks.getPublicBoardBySlug.mockResolvedValue({ id: boardId, slug });
    mocks.adminQuery.maybeSingle.mockResolvedValue({
      data: attachmentRow(overrides),
      error: null,
    });

    await expect(
      getDeliverableBoardImage(slug, attachmentId),
    ).resolves.toBeNull();
  });

  it("fails closed for missing, erroneous, or malformed attachment data", async () => {
    mocks.getPublicBoardBySlug.mockResolvedValue({ id: boardId, slug });

    mocks.adminQuery.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    await expect(
      getDeliverableBoardImage(slug, attachmentId),
    ).resolves.toBeNull();

    mocks.adminQuery.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: storagePath },
    });
    await expect(
      getDeliverableBoardImage(slug, attachmentId),
    ).resolves.toBeNull();

    mocks.adminQuery.maybeSingle.mockResolvedValueOnce({
      data: attachmentRow({ mime_type: "image/svg+xml" }),
      error: null,
    });
    await expect(
      getDeliverableBoardImage(slug, attachmentId),
    ).resolves.toBeNull();
  });
});
