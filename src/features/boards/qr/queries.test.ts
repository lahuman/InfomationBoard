import { beforeEach, describe, expect, it, vi } from "vitest";
import { getQrBoardBySlug } from "./queries";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eqSlug: vi.fn(),
  eqStatus: vi.fn(),
  inVisibility: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({ from: mocks.from })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eqSlug });
  mocks.eqSlug.mockReturnValue({ eq: mocks.eqStatus });
  mocks.eqStatus.mockReturnValue({ in: mocks.inVisibility });
  mocks.inVisibility.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({
    data: { slug: "summer-night-market" },
    error: null,
  });
});

describe("getQrBoardBySlug", () => {
  it("accepts only published public or password boards", async () => {
    await expect(getQrBoardBySlug("summer-night-market")).resolves.toEqual({
      slug: "summer-night-market",
    });
    expect(mocks.select).toHaveBeenCalledWith("slug");
    expect(mocks.eqSlug).toHaveBeenCalledWith("slug", "summer-night-market");
    expect(mocks.eqStatus).toHaveBeenCalledWith("status", "published");
    expect(mocks.inVisibility).toHaveBeenCalledWith("visibility", [
      "public",
      "password",
    ]);
  });

  it("returns null for invalid or unavailable boards", async () => {
    await expect(getQrBoardBySlug("../private")).resolves.toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();

    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getQrBoardBySlug("draft-board")).resolves.toBeNull();
  });
});
