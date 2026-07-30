import { Blob } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const attachmentId = "30000000-0000-4000-8000-000000000003";
const slug = "summer-market";
const storagePath =
  "10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000003";

const mocks = vi.hoisted(() => ({
  getDeliverableBoardImage: vi.fn(),
  storageFrom: vi.fn(),
  download: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/boards/images/delivery", () => ({
  getDeliverableBoardImage: mocks.getDeliverableBoardImage,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    storage: { from: mocks.storageFrom },
  })),
}));

function routeContext(
  params: { slug: string; attachmentId: string } = { slug, attachmentId },
) {
  return { params: Promise.resolve(params) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDeliverableBoardImage.mockResolvedValue({
    storagePath,
    mimeType: "image/png",
    sizeBytes: 8,
  });
  mocks.storageFrom.mockReturnValue({ download: mocks.download });
  mocks.download.mockResolvedValue({
    data: new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
      type: "application/octet-stream",
    }),
    error: null,
  });
});

describe("GET board image", () => {
  it("streams authorized bytes with recorded metadata and private headers", async () => {
    const expectedBytes = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
    const response = await GET(
      new Request(`https://boards.example/b/${slug}/images/${attachmentId}`),
      routeContext(),
    );
    const leakCheck = response.clone();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe("8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=300",
    );
    expect(
      new Uint8Array(await response.arrayBuffer()),
    ).toEqual(expectedBytes);
    expect(await leakCheck.text()).not.toContain(storagePath);
    expect(JSON.stringify([...leakCheck.headers])).not.toContain(storagePath);
    expect(mocks.storageFrom).toHaveBeenCalledWith("board-images");
    expect(mocks.download).toHaveBeenCalledWith(storagePath);
  });

  it.each([
    ["malformed slug", { slug: "Summer Market", attachmentId }],
    ["malformed attachment", { slug, attachmentId: "not-a-uuid" }],
    [
      "non-v4 attachment",
      {
        slug,
        attachmentId: "30000000-0000-3000-8000-000000000003",
      },
    ],
  ])("returns an empty generic 404 for a %s", async (_label, params) => {
    const response = await GET(
      new Request("https://boards.example"),
      routeContext(params),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(mocks.getDeliverableBoardImage).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("returns an empty generic 404 when authorization is denied", async () => {
    mocks.getDeliverableBoardImage.mockResolvedValue(null);

    const response = await GET(
      new Request("https://boards.example"),
      routeContext(),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("returns an empty generic 404 when route parameters cannot be read", async () => {
    const response = await GET(new Request("https://boards.example"), {
      params: Promise.reject(new Error(storagePath)),
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(mocks.getDeliverableBoardImage).not.toHaveBeenCalled();
  });

  it.each([
    [
      "download error",
      {
        data: null,
        error: { message: storagePath },
      },
    ],
    [
      "missing blob",
      {
        data: null,
        error: null,
      },
    ],
    [
      "recorded length mismatch",
      {
        data: new Blob([new Uint8Array([1, 2, 3])]),
        error: null,
      },
    ],
  ])("returns an empty generic 404 for a %s", async (_label, result) => {
    mocks.download.mockResolvedValue(result);

    const response = await GET(
      new Request("https://boards.example"),
      routeContext(),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(JSON.stringify([...response.headers])).not.toContain(storagePath);
  });

  it("returns an empty generic 404 when storage throws", async () => {
    mocks.download.mockRejectedValue(new Error(storagePath));

    const response = await GET(
      new Request("https://boards.example"),
      routeContext(),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });
});
