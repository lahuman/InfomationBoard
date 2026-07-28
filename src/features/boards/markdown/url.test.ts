import { describe, expect, it } from "vitest";
import { isExternalBoardUrl, sanitizeBoardUrl } from "./url";

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

