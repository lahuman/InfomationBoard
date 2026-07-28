import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  getQrBoardBySlug: vi.fn(),
  canonicalBoardUrl: vi.fn(),
  generateQrPng: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/boards/qr/queries", () => ({
  getQrBoardBySlug: mocks.getQrBoardBySlug,
}));
vi.mock("@/features/boards/qr/qr", () => ({
  canonicalBoardUrl: mocks.canonicalBoardUrl,
  generateQrPng: mocks.generateQrPng,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getQrBoardBySlug.mockResolvedValue({ slug: "summer-night-market" });
  mocks.canonicalBoardUrl.mockReturnValue(
    "https://boards.example/b/summer-night-market",
  );
  mocks.generateQrPng.mockResolvedValue(
    Buffer.from("89504e470d0a1a0a", "hex"),
  );
});

describe("GET qr.png", () => {
  it("downloads a PNG containing only the canonical URL", async () => {
    const response = await GET(new Request("https://boards.example"), {
      params: Promise.resolve({ slug: "summer-night-market" }),
    });

    expect(mocks.generateQrPng).toHaveBeenCalledWith(
      "https://boards.example/b/summer-night-market",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="summer-night-market-qr.png"',
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns the same not-found response for ineligible boards", async () => {
    mocks.getQrBoardBySlug.mockResolvedValue(null);
    const response = await GET(new Request("https://boards.example"), {
      params: Promise.resolve({ slug: "draft-board" }),
    });
    expect(response.status).toBe(404);
    expect(mocks.generateQrPng).not.toHaveBeenCalled();
  });
});
