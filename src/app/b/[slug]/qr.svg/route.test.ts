import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  getQrBoardBySlug: vi.fn(),
  canonicalBoardUrl: vi.fn(),
  generateQrSvg: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/boards/qr/queries", () => ({
  getQrBoardBySlug: mocks.getQrBoardBySlug,
}));
vi.mock("@/features/boards/qr/qr", () => ({
  canonicalBoardUrl: mocks.canonicalBoardUrl,
  generateQrSvg: mocks.generateQrSvg,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getQrBoardBySlug.mockResolvedValue({ slug: "summer-night-market" });
  mocks.canonicalBoardUrl.mockReturnValue(
    "https://boards.example/b/summer-night-market",
  );
  mocks.generateQrSvg.mockResolvedValue(
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
  );
});

describe("GET qr.svg", () => {
  it("downloads library-generated SVG with hardened headers", async () => {
    const response = await GET(new Request("https://boards.example"), {
      params: Promise.resolve({ slug: "summer-night-market" }),
    });

    expect(mocks.generateQrSvg).toHaveBeenCalledWith(
      "https://boards.example/b/summer-night-market",
    );
    expect(response.headers.get("content-type")).toBe(
      "image/svg+xml; charset=utf-8",
    );
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; sandbox",
    );
    expect(await response.text()).not.toContain("password");
  });

  it("serves the same safe QR inline only for the owner preview", async () => {
    const response = await GET(
      new Request("https://boards.example?preview=1"),
      { params: Promise.resolve({ slug: "summer-night-market" }) },
    );
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="summer-night-market-qr.svg"',
    );
    expect(mocks.generateQrSvg).toHaveBeenCalledWith(
      "https://boards.example/b/summer-night-market",
    );
  });

  it("rejects unavailable boards", async () => {
    mocks.getQrBoardBySlug.mockResolvedValue(null);
    const response = await GET(new Request("https://boards.example"), {
      params: Promise.resolve({ slug: "private-board" }),
    });
    expect(response.status).toBe(404);
  });
});
