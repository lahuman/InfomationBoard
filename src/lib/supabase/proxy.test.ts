import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { updateSupabaseSession } from "./proxy";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env/public", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createServerClient.mockImplementation(
    (_url: string, _key: string, options: {
      cookies: {
        setAll: (
          values: Array<{
            name: string;
            value: string;
            options?: { httpOnly?: boolean; path?: string };
          }>,
        ) => void;
      };
    }) => ({
      auth: {
        getClaims: async () => {
          mocks.getClaims();
          options.cookies.setAll([
            {
              name: "sb-session",
              value: "refreshed",
              options: { httpOnly: true, path: "/" },
            },
          ]);
          return { data: { claims: null }, error: null };
        },
        getSession: mocks.getSession,
      },
    }),
  );
});

it("refreshes claims and copies changed cookies to a private response", async () => {
  const request = new NextRequest("https://app.test/dashboard", {
    headers: { cookie: "existing=value" },
  });
  const requestHeaders = new Headers(request.headers);

  const response = await updateSupabaseSession(request, requestHeaders);

  expect(mocks.getClaims).toHaveBeenCalledOnce();
  expect(mocks.getSession).not.toHaveBeenCalled();
  expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
