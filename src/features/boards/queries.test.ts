import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardDataError, getDashboardData } from "./queries";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  profileSelect: vi.fn(),
  profileEq: vi.fn(),
  profileSingle: vi.fn(),
  boardsSelect: vi.fn(),
  boardsEq: vi.fn(),
  boardsOrder: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: mocks.from,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();

  mocks.profileSelect.mockReturnValue({ eq: mocks.profileEq });
  mocks.profileEq.mockReturnValue({ single: mocks.profileSingle });
  mocks.boardsSelect.mockReturnValue({ eq: mocks.boardsEq });
  mocks.boardsEq.mockReturnValue({ order: mocks.boardsOrder });
  mocks.from.mockImplementation((table: string) => {
    if (table === "profiles") return { select: mocks.profileSelect };
    if (table === "boards") return { select: mocks.boardsSelect };
    throw new Error(`Unexpected table: ${table}`);
  });

  mocks.profileSingle.mockResolvedValue({
    data: { storage_bytes: 1_048_576 },
    error: null,
  });
  mocks.boardsOrder.mockResolvedValue({
    data: [
      {
        id: "30000000-0000-4000-8000-000000000003",
        title: "여름 야시장",
        template: "event",
        status: "draft",
        revision: 2,
        updated_at: "2026-07-28T10:00:00.000Z",
      },
    ],
    error: null,
  });
});

describe("getDashboardData", () => {
  it("loads only the owner profile and boards ordered by recent update", async () => {
    await expect(getDashboardData("owner-id")).resolves.toEqual({
      storageBytes: 1_048_576,
      boards: [
        {
          id: "30000000-0000-4000-8000-000000000003",
          title: "여름 야시장",
          template: "event",
          status: "draft",
          revision: 2,
          updatedAt: "2026-07-28T10:00:00.000Z",
        },
      ],
    });

    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(mocks.profileSelect).toHaveBeenCalledWith("storage_bytes");
    expect(mocks.profileEq).toHaveBeenCalledWith("id", "owner-id");
    expect(mocks.from).toHaveBeenCalledWith("boards");
    expect(mocks.boardsEq).toHaveBeenCalledWith("owner_id", "owner-id");
    expect(mocks.boardsOrder).toHaveBeenCalledWith("updated_at", {
      ascending: false,
    });
  });

  it("returns an empty board list without treating it as an error", async () => {
    mocks.boardsOrder.mockResolvedValue({ data: null, error: null });

    await expect(getDashboardData("owner-id")).resolves.toEqual({
      storageBytes: 1_048_576,
      boards: [],
    });
  });

  it("maps database failures to a safe domain error", async () => {
    mocks.boardsOrder.mockResolvedValue({
      data: null,
      error: { message: "relation details must not escape" },
    });

    await expect(getDashboardData("owner-id")).rejects.toBeInstanceOf(
      DashboardDataError,
    );
  });
});

