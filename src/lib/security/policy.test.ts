import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildContentSecurityPolicy,
  STATIC_SECURITY_HEADERS,
} from "./policy";
import { proxy } from "@/proxy";

const mocks = vi.hoisted(() => ({
  updateSupabaseSession: vi.fn(async () => NextResponse.next()),
}));

vi.mock("@/lib/env/public", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  }),
}));

vi.mock("@/lib/supabase/proxy", () => ({
  updateSupabaseSession: mocks.updateSupabaseSession,
}));

describe("security policy", () => {
  it("sets the required static browser security policies", () => {
    expect(
      Object.fromEntries(
        STATIC_SECURITY_HEADERS.map(({ key, value }) => [key, value]),
      ),
    ).toMatchObject({
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": expect.stringContaining("camera=()"),
    });
  });

  it("requires the request nonce for scripts", () => {
    const csp = buildContentSecurityPolicy("abc123");

    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).toContain("object-src 'none'");
  });

  it("allows only the configured Supabase origin for connections", () => {
    const csp = buildContentSecurityPolicy(
      "abc123",
      "https://project.supabase.co",
    );

    expect(csp).toContain(
      "connect-src 'self' https://project.supabase.co",
    );
  });

  it("retains the nonce policy after session refresh", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3000/dashboard"),
    );
    const csp = response.headers.get("content-security-policy");

    expect(mocks.updateSupabaseSession).toHaveBeenCalledOnce();
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toContain(
      "connect-src 'self' https://project.supabase.co",
    );
  });
});
