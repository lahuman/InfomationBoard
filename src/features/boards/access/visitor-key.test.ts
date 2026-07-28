import { describe, expect, it, vi } from "vitest";
import { coarseVisitorKey, hashVisitorKey } from "./visitor-key";

vi.mock("server-only", () => ({}));

describe("coarseVisitorKey", () => {
  it("uses the first forwarded IPv4 address at /24 granularity", () => {
    expect(coarseVisitorKey("203.0.113.42, 10.0.0.1")).toBe(
      "ipv4:203.0.113.0/24",
    );
  });

  it("uses IPv6 at /64 granularity and safely handles missing input", () => {
    expect(coarseVisitorKey("2001:db8:abcd:12::99")).toBe(
      "ipv6:2001:0db8:abcd:0012::/64",
    );
    expect(coarseVisitorKey(null)).toBe("unknown");
    expect(coarseVisitorKey("not-an-address")).toBe("unknown");
  });
});

describe("hashVisitorKey", () => {
  it("returns a deterministic domain-separated SHA-256 HMAC", () => {
    const hash = hashVisitorKey("ipv4:203.0.113.0/24", "server-secret");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashVisitorKey("ipv4:203.0.113.0/24", "server-secret")).toBe(
      hash,
    );
    expect(hashVisitorKey("ipv4:203.0.114.0/24", "server-secret")).not.toBe(
      hash,
    );
  });
});
