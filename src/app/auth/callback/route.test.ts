import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
});

describe("PKCE auth callback", () => {
  it("exchanges a valid code and redirects internally", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/auth/callback?code=valid&next=%2Fdashboard",
      ),
    );

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("valid");
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/dashboard",
    );
  });

  it("rejects external next destinations", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/auth/callback?code=valid&next=https%3A%2F%2Fevil.test",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/dashboard",
    );
  });

  it("exposes only a stable callback code on failure", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: { message: "sensitive provider details" },
    });
    const response = await GET(
      new NextRequest("http://localhost:3000/auth/callback?code=rejected"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=callback",
    );
    expect(response.headers.get("location")).not.toContain("sensitive");
  });

  it("rejects a missing code", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/auth/callback"),
    );

    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=callback",
    );
  });
});
