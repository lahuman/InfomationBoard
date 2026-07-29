import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestMagicLink,
  signInWithGoogle,
  signOut,
  type AuthActionState,
} from "./actions";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  signInWithOtp: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      signInWithOAuth: mocks.signInWithOAuth,
      signOut: mocks.signOut,
    },
  })),
}));

const idle: AuthActionState = { status: "idle" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  mocks.signInWithOAuth.mockResolvedValue({
    data: { url: "https://accounts.google.test/oauth" },
    error: null,
  });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe("requestMagicLink", () => {
  it("requests a link using only the validated internal destination", async () => {
    const formData = new FormData();
    formData.set("email", "owner@example.com");
    formData.set("next", "/dashboard");

    const result = await requestMagicLink(idle, formData);

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "owner@example.com",
      options: {
        shouldCreateUser: true,
        emailRedirectTo:
          "http://localhost:3000/auth/callback?next=%2Fdashboard",
      },
    });
    expect(result).toEqual({
      status: "success",
      message:
        "입력한 주소로 로그인 링크를 보냈습니다. 이메일을 확인해 주세요.",
    });
  });

  it("replaces an external destination in the callback with the dashboard", async () => {
    const formData = new FormData();
    formData.set("email", "owner@example.com");
    formData.set("next", "https://evil.test/steal");

    await requestMagicLink(idle, formData);

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "owner@example.com",
      options: {
        shouldCreateUser: true,
        emailRedirectTo:
          "http://localhost:3000/auth/callback?next=%2Fdashboard",
      },
    });
  });

  it("rejects invalid email before contacting Supabase", async () => {
    const formData = new FormData();
    formData.set("email", "not-an-email");

    await expect(requestMagicLink(idle, formData)).resolves.toEqual({
      status: "error",
      message: "이메일 주소를 확인해 주세요.",
    });
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("maps rate limits without exposing provider details", async () => {
    mocks.signInWithOtp.mockResolvedValue({
      error: { status: 429, message: "sensitive provider details" },
    });
    const formData = new FormData();
    formData.set("email", "owner@example.com");

    const result = await requestMagicLink(idle, formData);

    expect(result).toEqual({
      status: "error",
      message: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });
});

describe("signInWithGoogle", () => {
  it("starts OAuth with a validated callback and redirects to the provider", async () => {
    const formData = new FormData();
    formData.set("next", "/dashboard");

    await signInWithGoogle(formData);

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo:
          "http://localhost:3000/auth/callback?next=%2Fdashboard",
      },
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      "https://accounts.google.test/oauth",
    );
  });

  it("uses a stable local error redirect", async () => {
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { message: "sensitive provider details" },
    });

    await signInWithGoogle(new FormData());

    expect(mocks.redirect).toHaveBeenCalledWith("/login?error=google");
    expect(mocks.redirect).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.redirect.mock.calls)).not.toContain("sensitive");
  });
});

it("signs out before returning to the landing page", async () => {
  await signOut();

  expect(mocks.signOut).toHaveBeenCalledOnce();
  expect(mocks.redirect).toHaveBeenCalledWith("/");
});
