import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidStoredImageError } from "../storage";
import { finalizeBoardImage } from "./finalize-image";

const ownerId = "10000000-0000-4000-8000-000000000001";
const boardId = "20000000-0000-4000-8000-000000000002";
const attachmentId = "30000000-0000-4000-8000-000000000003";
const storagePath = `${ownerId}/${boardId}/${attachmentId}`;
const verifiedBytes = new Uint8Array(68);

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  verifyStoredImage: vi.fn(),
  from: vi.fn(),
  attachmentSelect: vi.fn(),
  attachmentIdEq: vi.fn(),
  attachmentBoardEq: vi.fn(),
  attachmentOwnerEq: vi.fn(),
  attachmentMaybeSingle: vi.fn(),
  profileSelect: vi.fn(),
  profileIdEq: vi.fn(),
  profileSingle: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/features/auth/require-user", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    storage: { from: mocks.storageFrom },
  })),
}));

vi.mock("../storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("../storage")>();
  return {
    ...original,
    verifyStoredImage: mocks.verifyStoredImage,
  };
});

function reservedAttachment(overrides: Record<string, unknown> = {}) {
  return {
    id: attachmentId,
    board_id: boardId,
    storage_path: storagePath,
    original_filename: "poster.png",
    mime_type: "image/png",
    size_bytes: 120,
    state: "reserved",
    reservation_expires_at: "2026-07-29T10:15:00.000Z",
    boards: { slug: "summer-market" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: ownerId, email: null });
  mocks.attachmentSelect.mockReturnValue({ eq: mocks.attachmentIdEq });
  mocks.attachmentIdEq.mockReturnValue({ eq: mocks.attachmentBoardEq });
  mocks.attachmentBoardEq.mockReturnValue({ eq: mocks.attachmentOwnerEq });
  mocks.attachmentOwnerEq.mockReturnValue({
    maybeSingle: mocks.attachmentMaybeSingle,
  });
  mocks.profileSelect.mockReturnValue({ eq: mocks.profileIdEq });
  mocks.profileIdEq.mockReturnValue({ single: mocks.profileSingle });
  mocks.from.mockImplementation((table: string) => {
    if (table === "attachments") return { select: mocks.attachmentSelect };
    if (table === "profiles") return { select: mocks.profileSelect };
    throw new Error(`Unexpected table: ${table}`);
  });
  mocks.attachmentMaybeSingle.mockResolvedValue({
    data: reservedAttachment(),
    error: null,
  });
  mocks.verifyStoredImage.mockResolvedValue({
    bytes: verifiedBytes,
    mimeType: "image/png",
  });
  mocks.rpc.mockResolvedValue({
    data: [
      {
        id: attachmentId,
        storage_path: storagePath,
        original_filename: "poster.png",
        mime_type: "image/png",
        size_bytes: verifiedBytes.byteLength,
        state: "ready",
        reservation_expires_at: null,
      },
    ],
    error: null,
  });
  mocks.profileSingle.mockResolvedValue({
    data: { storage_bytes: verifiedBytes.byteLength },
    error: null,
  });
  mocks.storageFrom.mockReturnValue({ remove: mocks.remove });
  mocks.remove.mockResolvedValue({ data: [], error: null });
});

describe("finalizeBoardImage", () => {
  it("rejects invalid input before authentication", async () => {
    await expect(
      finalizeBoardImage({ boardId, attachmentId: "invalid" }),
    ).resolves.toEqual({
      status: "error",
      code: "invalid",
      message: "업로드 정보를 확인해 주세요.",
    });
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });

  it("resolves the owned row, adjusts quota to verified bytes, and maps the ready image", async () => {
    await expect(
      finalizeBoardImage({ boardId, attachmentId }),
    ).resolves.toEqual({
      status: "ready",
      image: {
        id: attachmentId,
        originalFilename: "poster.png",
        mimeType: "image/png",
        sizeBytes: verifiedBytes.byteLength,
        url: `/b/summer-market/images/${attachmentId}`,
      },
      storageBytes: verifiedBytes.byteLength,
    });

    expect(mocks.requireUser).toHaveBeenCalledWith(`/boards/${boardId}/edit`);
    expect(mocks.attachmentIdEq).toHaveBeenCalledWith("id", attachmentId);
    expect(mocks.attachmentBoardEq).toHaveBeenCalledWith("board_id", boardId);
    expect(mocks.attachmentOwnerEq).toHaveBeenCalledWith("owner_id", ownerId);
    expect(mocks.rpc).toHaveBeenCalledWith("finalize_board_image", {
      p_attachment_id: attachmentId,
      p_mime_type: "image/png",
      p_actual_size_bytes: verifiedBytes.byteLength,
    });
  });

  it("supports an idempotent retry of an already-ready row", async () => {
    mocks.attachmentMaybeSingle.mockResolvedValueOnce({
      data: reservedAttachment({
        state: "ready",
        size_bytes: verifiedBytes.byteLength,
        reservation_expires_at: null,
      }),
      error: null,
    });

    await expect(
      finalizeBoardImage({ boardId, attachmentId }),
    ).resolves.toMatchObject({ status: "ready" });

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("rejects a decoded MIME mismatch and cleans the object before cancelling", async () => {
    const calls: string[] = [];
    mocks.verifyStoredImage.mockResolvedValueOnce({
      bytes: verifiedBytes,
      mimeType: "image/jpeg",
    });
    mocks.remove.mockImplementationOnce(async () => {
      calls.push("remove");
      return { data: [], error: null };
    });
    mocks.rpc.mockImplementationOnce(async (name: string) => {
      calls.push(name);
      return { data: undefined, error: null };
    });

    const result = await finalizeBoardImage({ boardId, attachmentId });

    expect(result).toMatchObject({ status: "error", code: "invalid" });
    expect(calls).toEqual(["remove", "cancel_board_image"]);
    expect(mocks.rpc).toHaveBeenCalledWith("cancel_board_image", {
      p_attachment_id: attachmentId,
    });
    expect(JSON.stringify(result)).not.toContain(storagePath);
  });

  it("cleans a missing or malformed object without disclosing its path", async () => {
    mocks.verifyStoredImage.mockRejectedValueOnce(
      new InvalidStoredImageError(),
    );

    const result = await finalizeBoardImage({ boardId, attachmentId });

    expect(mocks.remove).toHaveBeenCalledWith([storagePath]);
    expect(mocks.rpc).toHaveBeenCalledWith("cancel_board_image", {
      p_attachment_id: attachmentId,
    });
    expect(result).toMatchObject({ status: "error", code: "invalid" });
    expect(JSON.stringify(result)).not.toContain(storagePath);
  });

  it.each([
    ["image_reservation_expired", "expired"],
    ["image_quota_exceeded", "quota"],
  ] as const)("maps finalize %s and cleans the reservation", async (message, code) => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message },
    });

    const result = await finalizeBoardImage({ boardId, attachmentId });

    expect(result).toMatchObject({ status: "error", code });
    expect(mocks.remove).toHaveBeenCalledWith([storagePath]);
    expect(mocks.rpc).toHaveBeenLastCalledWith("cancel_board_image", {
      p_attachment_id: attachmentId,
    });
  });

  it("preserves the row and quota when failure cleanup cannot remove the object", async () => {
    mocks.verifyStoredImage.mockRejectedValueOnce(
      new InvalidStoredImageError(),
    );
    mocks.remove.mockResolvedValueOnce({
      data: null,
      error: { message: `failed ${storagePath}` },
    });

    const result = await finalizeBoardImage({ boardId, attachmentId });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "error", code: "unavailable" });
    expect(JSON.stringify(result)).not.toContain(storagePath);
  });
});
