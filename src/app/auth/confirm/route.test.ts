import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      verifyOtp: mocks.verifyOtp,
    },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyOtp.mockResolvedValue({ error: null });
});

describe("email auth confirmation", () => {
  it("verifies a supported token hash and redirects internally", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/auth/confirm?token_hash=valid&type=email&next=%2Fdashboard",
      ),
    );

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "valid",
      type: "email",
    });
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/dashboard",
    );
  });

  it.each([
    "http://localhost:3000/auth/confirm",
    "http://localhost:3000/auth/confirm?token_hash=valid&type=sms",
  ])("rejects missing or unsupported input", async (url) => {
    const response = await GET(new NextRequest(url));

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=expired",
    );
  });

  it("does not expose provider failure details", async () => {
    mocks.verifyOtp.mockResolvedValue({
      error: { message: "sensitive provider details" },
    });
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/auth/confirm?token_hash=expired&type=email",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=expired",
    );
    expect(response.headers.get("location")).not.toContain("sensitive");
  });
});
