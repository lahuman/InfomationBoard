import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPasswordAccess } from "./verify-password";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  headers: vi.fn(),
  cookies: vi.fn(),
  cookieSet: vi.fn(),
  getPasswordBoardBySlug: vi.fn(),
  getPasswordLock: vi.fn(),
  recordPasswordFailure: vi.fn(),
  clearPasswordFailures: vi.fn(),
  createAccessToken: vi.fn(),
  accessCookieOptions: vi.fn(),
  coarseVisitorKey: vi.fn(),
  hashVisitorKey: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("argon2", () => ({ verify: mocks.verify }));
vi.mock("next/headers", () => ({
  headers: mocks.headers,
  cookies: mocks.cookies,
}));
vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({ SUPABASE_SECRET_KEY: "server-secret" }),
}));
vi.mock("./password-board", () => ({
  getPasswordBoardBySlug: mocks.getPasswordBoardBySlug,
}));
vi.mock("./lockout", () => ({
  getPasswordLock: mocks.getPasswordLock,
  recordPasswordFailure: mocks.recordPasswordFailure,
  clearPasswordFailures: mocks.clearPasswordFailures,
}));
vi.mock("./visitor-key", () => ({
  coarseVisitorKey: mocks.coarseVisitorKey,
  hashVisitorKey: mocks.hashVisitorKey,
}));
vi.mock("./access-cookie", () => ({
  ACCESS_COOKIE_NAME: "ib_board_access",
  createAccessToken: mocks.createAccessToken,
  accessCookieOptions: mocks.accessCookieOptions,
}));

const protectedBoard = {
  board: {
    id: "53000000-0000-4000-8000-000000000001",
    slug: "locked-board",
  },
  passwordHash: "$argon2id$server-only-hash",
  secretVersion: "2026-07-28T11:30:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(
    new Headers({ "x-forwarded-for": "203.0.113.42" }),
  );
  mocks.cookies.mockResolvedValue({ set: mocks.cookieSet });
  mocks.getPasswordBoardBySlug.mockResolvedValue(protectedBoard);
  mocks.coarseVisitorKey.mockReturnValue("ipv4:203.0.113.0/24");
  mocks.hashVisitorKey.mockReturnValue("a".repeat(64));
  mocks.getPasswordLock.mockResolvedValue({ lockedUntil: null });
  mocks.verify.mockResolvedValue(true);
  mocks.clearPasswordFailures.mockResolvedValue(true);
  mocks.createAccessToken.mockReturnValue("signed-token");
  mocks.accessCookieOptions.mockReturnValue({ path: "/b/locked-board" });
});

describe("verifyPasswordAccess", () => {
  it("sets a board-scoped signed cookie after successful verification", async () => {
    await expect(
      verifyPasswordAccess({ slug: "locked-board", password: "visitor-pass" }),
    ).resolves.toEqual({ status: "unlocked" });

    expect(mocks.verify).toHaveBeenCalledWith(
      "$argon2id$server-only-hash",
      "visitor-pass",
    );
    expect(mocks.clearPasswordFailures).toHaveBeenCalledWith(
      protectedBoard.board.id,
      "a".repeat(64),
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "ib_board_access",
      "signed-token",
      { path: "/b/locked-board" },
    );
  });

  it("records an incorrect password without exposing internals", async () => {
    mocks.verify.mockResolvedValue(false);
    mocks.recordPasswordFailure.mockResolvedValue({
      failedCount: 2,
      locked: false,
    });

    await expect(
      verifyPasswordAccess({ slug: "locked-board", password: "wrong-pass" }),
    ).resolves.toEqual({
      status: "invalid",
      message: "비밀번호를 확인해 주세요.",
    });
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("locks on the fifth failure", async () => {
    mocks.verify.mockResolvedValue(false);
    mocks.recordPasswordFailure.mockResolvedValue({
      failedCount: 5,
      locked: true,
    });

    await expect(
      verifyPasswordAccess({ slug: "locked-board", password: "wrong-pass" }),
    ).resolves.toMatchObject({ status: "locked" });
  });

  it("does not run Argon2 while the visitor is locked", async () => {
    mocks.getPasswordLock.mockResolvedValue({
      lockedUntil: "2026-07-28T12:15:00.000Z",
    });

    await expect(
      verifyPasswordAccess({ slug: "locked-board", password: "visitor-pass" }),
    ).resolves.toMatchObject({ status: "locked" });
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("fails closed when lockout storage is unavailable", async () => {
    mocks.getPasswordLock.mockResolvedValue(null);

    await expect(
      verifyPasswordAccess({ slug: "locked-board", password: "visitor-pass" }),
    ).resolves.toMatchObject({ status: "error" });
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});
