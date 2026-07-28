import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";

function normalizeIpv6(address: string) {
  const [left = "", right = ""] = address.toLowerCase().split("::", 2);
  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];
  const missing = Math.max(0, 8 - leftParts.length - rightParts.length);
  const parts = [
    ...leftParts,
    ...Array.from({ length: missing }, () => "0"),
    ...rightParts,
  ];

  return parts.slice(0, 4).map((part) => part.padStart(4, "0")).join(":");
}

export function coarseVisitorKey(forwardedFor: string | null): string {
  const address = forwardedFor?.split(",", 1)[0]?.trim().split("%", 1)[0];
  if (!address) return "unknown";

  const version = isIP(address);
  if (version === 4) {
    const octets = address.split(".");
    return `ipv4:${octets.slice(0, 3).join(".")}.0/24`;
  }
  if (version === 6) return `ipv6:${normalizeIpv6(address)}::/64`;
  return "unknown";
}

export function hashVisitorKey(visitorKey: string, secret: string): string {
  return createHmac("sha256", secret)
    .update("informationboard:visitor-key:v1\0")
    .update(visitorKey)
    .digest("hex");
}
