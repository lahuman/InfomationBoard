import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBoardImageLibrary } from "./queries";

const imageId = "30000000-0000-4000-8000-000000000003";
const ownerId = "10000000-0000-4000-8000-000000000001";
const boardId = "20000000-0000-4000-8000-000000000002";

const mocks = vi.hoisted(() => ({
  cleanupExpiredBoardImages: vi.fn(),
  from: vi.fn(),
  attachmentsSelect: vi.fn(),
  attachmentsOwnerEq: vi.fn(),
  attachmentsBoardEq: vi.fn(),
  attachmentsStateEq: vi.fn(),
  attachmentsOrder: vi.fn(),
  profileSelect: vi.fn(),
  profileEq: vi.fn(),
  profileSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ from: mocks.from })),
}));

vi.mock("./storage", () => ({
  cleanupExpiredBoardImages: mocks.cleanupExpiredBoardImages,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cleanupExpiredBoardImages.mockResolvedValue({ ok: true });

  mocks.attachmentsSelect.mockReturnValue({ eq: mocks.attachmentsOwnerEq });
  mocks.attachmentsOwnerEq.mockReturnValue({ eq: mocks.attachmentsBoardEq });
  mocks.attachmentsBoardEq.mockReturnValue({ eq: mocks.attachmentsStateEq });
  mocks.attachmentsStateEq.mockReturnValue({ order: mocks.attachmentsOrder });
  mocks.profileSelect.mockReturnValue({ eq: mocks.profileEq });
  mocks.profileEq.mockReturnValue({ single: mocks.profileSingle });
  mocks.from.mockImplementation((table: string) => {
    if (table === "attachments") return { select: mocks.attachmentsSelect };
    if (table === "profiles") return { select: mocks.profileSelect };
    throw new Error(`Unexpected table: ${table}`);
  });

  mocks.attachmentsOrder.mockResolvedValue({
    data: [
      {
        id: imageId,
        original_filename: "poster.png",
        mime_type: "image/png",
        size_bytes: 1_048_576,
        state: "ready",
      },
    ],
    error: null,
  });
  mocks.profileSingle.mockResolvedValue({
    data: { storage_bytes: 1_048_576 },
    error: null,
  });
});

describe("getBoardImageLibrary", () => {
  it("loads only ready images owned by the board owner and maps their safe URLs", async () => {
    await expect(
      getBoardImageLibrary(ownerId, boardId, "summer-market"),
    ).resolves.toEqual({
      storageBytes: 1_048_576,
      images: [
        {
          id: imageId,
          originalFilename: "poster.png",
          mimeType: "image/png",
          sizeBytes: 1_048_576,
          url: `/b/summer-market/images/${imageId}`,
        },
      ],
    });

    expect(mocks.from).toHaveBeenCalledWith("attachments");
    expect(mocks.cleanupExpiredBoardImages).toHaveBeenCalledWith(
      ownerId,
      expect.objectContaining({ from: mocks.from }),
    );
    expect(mocks.attachmentsSelect).toHaveBeenCalledWith(
      "id, original_filename, mime_type, size_bytes, state",
    );
    expect(mocks.attachmentsOwnerEq).toHaveBeenCalledWith("owner_id", ownerId);
    expect(mocks.attachmentsBoardEq).toHaveBeenCalledWith("board_id", boardId);
    expect(mocks.attachmentsStateEq).toHaveBeenCalledWith("state", "ready");
    expect(mocks.attachmentsOrder).toHaveBeenCalledWith("created_at", {
      ascending: true,
    });
    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(mocks.profileSelect).toHaveBeenCalledWith("storage_bytes");
    expect(mocks.profileEq).toHaveBeenCalledWith("id", ownerId);
  });

  it("fails closed without loading the library when expired cleanup fails", async () => {
    mocks.cleanupExpiredBoardImages.mockResolvedValueOnce({ ok: false });

    await expect(
      getBoardImageLibrary(ownerId, boardId, "summer-market"),
    ).resolves.toBeNull();

    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns null without querying when owner, board, or slug inputs are invalid", async () => {
    await expect(
      getBoardImageLibrary("not-a-uuid", boardId, "summer-market"),
    ).resolves.toBeNull();
    await expect(
      getBoardImageLibrary(ownerId, "not-a-uuid", "summer-market"),
    ).resolves.toBeNull();
    await expect(
      getBoardImageLibrary(ownerId, boardId, "Summer Market"),
    ).resolves.toBeNull();

    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns null for database failures or malformed image and usage rows", async () => {
    mocks.attachmentsOrder.mockResolvedValueOnce({
      data: null,
      error: { message: "hidden" },
    });
    await expect(
      getBoardImageLibrary(ownerId, boardId, "summer-market"),
    ).resolves.toBeNull();

    mocks.attachmentsOrder.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      getBoardImageLibrary(ownerId, boardId, "summer-market"),
    ).resolves.toBeNull();

    mocks.attachmentsOrder.mockResolvedValueOnce({
      data: [
        {
          id: imageId,
          original_filename: "bad.svg",
          mime_type: "image/svg+xml",
          size_bytes: 12,
          state: "ready",
        },
      ],
      error: null,
    });
    await expect(
      getBoardImageLibrary(ownerId, boardId, "summer-market"),
    ).resolves.toBeNull();

    mocks.profileSingle.mockResolvedValueOnce({
      data: { storage_bytes: -1 },
      error: null,
    });
    await expect(
      getBoardImageLibrary(ownerId, boardId, "summer-market"),
    ).resolves.toBeNull();
  });
});
