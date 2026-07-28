import { describe, expect, it, vi } from "vitest";
import {
  canonicalBoardUrl,
  generateQrPng,
  generateQrSvg,
} from "./qr";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/public", () => ({
  getPublicEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://boards.example/base" }),
}));

describe("canonicalBoardUrl", () => {
  it("uses only the configured application origin and stable slug", () => {
    expect(canonicalBoardUrl("summer-night-market")).toBe(
      "https://boards.example/b/summer-night-market",
    );
  });

  it("rejects values that could add paths, queries, or tokens", () => {
    expect(() => canonicalBoardUrl("board?password=secret")).toThrow(
      "Invalid board slug",
    );
    expect(() => canonicalBoardUrl("../private")).toThrow(
      "Invalid board slug",
    );
  });
});

describe("QR encoders", () => {
  it("generates a PNG image", async () => {
    const png = await generateQrPng(
      "https://boards.example/b/summer-night-market",
    );
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("generates library-authored SVG markup", async () => {
    const svg = await generateQrSvg(
      "https://boards.example/b/summer-night-market",
    );
    expect(svg).toMatch(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain("<path");
    expect(svg).not.toContain("<script");
  });
});
