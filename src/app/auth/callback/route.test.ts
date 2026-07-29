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
  it("uses and clears the remembered internal destination", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/auth/callback?code=valid", {
        headers: {
          cookie: "informationboard-auth-next=/boards/new",
        },
      }),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/boards/new",
    );
    expect(response.cookies.get("informationboard-auth-next")).toMatchObject({
      value: "",
      maxAge: 0,
      path: "/auth/callback",
    });
  });

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
