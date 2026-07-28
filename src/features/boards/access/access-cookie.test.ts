import { describe, expect, it, vi } from "vitest";
import {
  ACCESS_COOKIE_MAX_AGE_SECONDS,
  accessCookieOptions,
  createAccessToken,
  verifyAccessToken,
} from "./access-cookie";

vi.mock("server-only", () => ({}));

const now = new Date("2026-07-28T12:00:00.000Z");
const grant = {
  boardId: "53000000-0000-4000-8000-000000000001",
  secretVersion: "2026-07-28T11:00:00.000Z",
};

describe("board access token", () => {
  it("signs a versioned board-scoped 12-hour grant", () => {
    const token = createAccessToken(grant, "server-secret", now);

    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(
      verifyAccessToken(token, grant, "server-secret", now),
    ).toBe(true);
    expect(
      verifyAccessToken(
        token,
        { ...grant, boardId: "53000000-0000-4000-8000-000000000002" },
        "server-secret",
        now,
      ),
    ).toBe(false);
    expect(
      verifyAccessToken(
        token,
        { ...grant, secretVersion: "2026-07-28T11:01:00.000Z" },
        "server-secret",
        now,
      ),
    ).toBe(false);
  });

  it("rejects tampering and expiry", () => {
    const token = createAccessToken(grant, "server-secret", now);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(verifyAccessToken(tampered, grant, "server-secret", now)).toBe(
      false,
    );
    expect(
      verifyAccessToken(
        token,
        grant,
        "server-secret",
        new Date(now.getTime() + 12 * 60 * 60 * 1000 + 1),
      ),
    ).toBe(false);
  });
});

describe("accessCookieOptions", () => {
  it("scopes the HttpOnly cookie to the canonical board path", () => {
    expect(accessCookieOptions("summer-night-market", true)).toEqual({
      httpOnly: true,
      maxAge: ACCESS_COOKIE_MAX_AGE_SECONDS,
      path: "/b/summer-night-market",
      sameSite: "lax",
      secure: true,
    });
  });
});
