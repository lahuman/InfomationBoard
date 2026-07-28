import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "./require-user";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getSession: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      getClaims: mocks.getClaims,
      getSession: mocks.getSession,
    },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

describe("requireUser", () => {
  it("redirects when verified claims are missing", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: null },
      error: null,
    });

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/login?next=%2Fdashboard",
    );
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("returns only the verified identity fields", async () => {
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "user-id",
          email: "owner@example.com",
          provider_token: "not-returned",
        },
      },
      error: null,
    });

    await expect(requireUser()).resolves.toEqual({
      id: "user-id",
      email: "owner@example.com",
    });
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("normalizes a non-string email to null", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user-id", email: 42 } },
      error: null,
    });

    await expect(requireUser()).resolves.toEqual({
      id: "user-id",
      email: null,
    });
  });
});
