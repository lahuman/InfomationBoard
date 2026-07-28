import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  STATIC_SECURITY_HEADERS,
} from "./policy";

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
});
