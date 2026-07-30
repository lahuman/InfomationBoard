import { describe, expect, it } from "vitest";
import {
  isExternalBoardUrl,
  sanitizeBoardImageUrl,
  sanitizeBoardUrl,
} from "./url";

describe("sanitizeBoardUrl", () => {
  it.each([
    "https://example.com/guide",
    "http://example.com",
    "mailto:hello@example.com",
    "/boards/guide",
    "./guide",
    "../guide",
    "#details",
    "?tab=preview",
  ])("accepts a safe link: %s", (url) => {
    expect(sanitizeBoardUrl(url)).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ])("rejects an unsafe link: %s", (url) => {
    expect(sanitizeBoardUrl(url)).toBe("");
  });
});

describe("isExternalBoardUrl", () => {
  it("identifies absolute and protocol-relative web links", () => {
    expect(isExternalBoardUrl("https://example.com")).toBe(true);
    expect(isExternalBoardUrl("//example.com/guide")).toBe(true);
  });

  it("keeps application-relative and email links in the same context", () => {
    expect(isExternalBoardUrl("/boards/guide")).toBe(false);
    expect(isExternalBoardUrl("#details")).toBe(false);
    expect(isExternalBoardUrl("mailto:hello@example.com")).toBe(false);
  });
});

describe("sanitizeBoardImageUrl", () => {
  const localImage =
    "/b/summer-market/images/30000000-0000-4000-8000-000000000003";

  it.each([
    localImage,
    "https://images.example.com/poster.png",
    "http://images.example.com/poster.webp",
  ])("accepts a safe image source: %s", (url) => {
    expect(sanitizeBoardImageUrl(url)).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    "data:image/png;base64,iVBORw0KGgo=",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "mailto:image@example.com",
    "/b/summer-market/images/not-a-uuid",
    "/b/summer-market/images/30000000-0000-3000-8000-000000000003",
    "/b/Summer-Market/images/30000000-0000-4000-8000-000000000003",
    "/other/poster.png",
    "./poster.png",
  ])("rejects an unsafe or malformed image source: %s", (url) => {
    expect(sanitizeBoardImageUrl(url)).toBe("");
  });
});
