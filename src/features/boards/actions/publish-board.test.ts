import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishBoard } from "./publish-board";

const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eqId: vi.fn(),
  eqOwner: vi.fn(),
  eqRevision: vi.fn(),
  updateSelect: vi.fn(),
  updateMaybeSingle: vi.fn(),
  currentSelect: vi.fn(),
  currentEqId: vi.fn(),
  currentEqOwner: vi.fn(),
  currentMaybeSingle: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/features/auth/require-user", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

vi.mock("argon2", () => ({
  argon2id: 2,
  hash: mocks.hash,
}));

const identity = {
  id: "30000000-0000-4000-8000-000000000003",
  revision: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    id: "10000000-0000-4000-8000-000000000001",
    email: null,
  });
  mocks.from.mockImplementation(() => ({
    update: mocks.update,
    select: mocks.currentSelect,
  }));
  mocks.update.mockReturnValue({ eq: mocks.eqId });
  mocks.eqId.mockReturnValue({ eq: mocks.eqOwner });
  mocks.eqOwner.mockReturnValue({ eq: mocks.eqRevision });
  mocks.eqRevision.mockReturnValue({ select: mocks.updateSelect });
  mocks.updateSelect.mockReturnValue({
    maybeSingle: mocks.updateMaybeSingle,
  });
  mocks.updateMaybeSingle.mockResolvedValue({
    data: {
      revision: 3,
      updated_at: "2026-07-28T12:00:00.000Z",
    },
    error: null,
  });
  mocks.currentSelect.mockReturnValue({ eq: mocks.currentEqId });
  mocks.currentEqId.mockReturnValue({ eq: mocks.currentEqOwner });
  mocks.currentEqOwner.mockReturnValue({
    maybeSingle: mocks.currentMaybeSingle,
  });
  mocks.currentMaybeSingle.mockResolvedValue({
    data: { slug: "summer-night-market" },
    error: null,
  });
  mocks.hash.mockResolvedValue("$argon2id$owner-password-hash");
  mocks.rpc.mockResolvedValue({
    data: [
      {
        revision: 3,
        updated_at: "2026-07-28T12:00:00.000Z",
      },
    ],
    error: null,
  });
});

describe("publishBoard", () => {
  it("publishes a public board only at the owner's expected revision", async () => {
    await expect(
      publishBoard({
        ...identity,
        mode: "public",
        allowIndexing: true,
      }),
    ).resolves.toEqual({
      status: "saved",
      revision: 3,
      updatedAt: "2026-07-28T12:00:00.000Z",
    });

    expect(mocks.update).toHaveBeenCalledWith({
      status: "published",
      visibility: "public",
      allow_indexing: true,
    });
    expect(mocks.eqOwner).toHaveBeenCalledWith(
      "owner_id",
      "10000000-0000-4000-8000-000000000001",
    );
    expect(mocks.eqRevision).toHaveBeenCalledWith("revision", 2);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/b/summer-night-market",
    );
  });

  it("returns a published board to a private draft with indexing disabled", async () => {
    await publishBoard({ ...identity, mode: "private-draft" });

    expect(mocks.update).toHaveBeenCalledWith({
      status: "draft",
      visibility: "private",
      allow_indexing: false,
    });
  });

  it("hashes a transient password before the atomic RPC", async () => {
    await expect(
      publishBoard({
        ...identity,
        mode: "password",
        password: "owner-password",
      }),
    ).resolves.toMatchObject({ status: "saved", revision: 3 });

    expect(mocks.hash).toHaveBeenCalledWith(
      "owner-password",
      expect.objectContaining({ type: 2 }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "publish_board_with_password",
      {
        p_board_id: identity.id,
        p_revision: identity.revision,
        p_password_hash: "$argon2id$owner-password-hash",
      },
    );
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(
      '"owner-password"',
    );
  });

  it("returns current publication state on a stale revision", async () => {
    mocks.updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.currentMaybeSingle.mockResolvedValue({
      data: {
        revision: 4,
        status: "published",
        visibility: "public",
        allow_indexing: false,
        updated_at: "2026-07-28T12:05:00.000Z",
      },
      error: null,
    });

    await expect(
      publishBoard({
        ...identity,
        mode: "public",
        allowIndexing: true,
      }),
    ).resolves.toEqual({
      status: "conflict",
      current: {
        revision: 4,
        status: "published",
        visibility: "public",
        allowIndexing: false,
        updatedAt: "2026-07-28T12:05:00.000Z",
      },
    });
  });

  it("rejects invalid password input before authentication or hashing", async () => {
    await expect(
      publishBoard({
        ...identity,
        mode: "password",
        password: "short",
      }),
    ).resolves.toMatchObject({ status: "validation_error" });

    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
  });

  it("maps the published-content database constraint to validation", async () => {
    mocks.updateMaybeSingle.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "boards_published_content" },
    });

    await expect(
      publishBoard({
        ...identity,
        mode: "public",
        allowIndexing: false,
      }),
    ).resolves.toEqual({
      status: "validation_error",
      message: "게시하려면 제목과 본문을 입력해 주세요.",
    });
  });

  it("returns a safe error without database details", async () => {
    mocks.updateMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "sensitive policy details" },
    });

    const result = await publishBoard({
      ...identity,
      mode: "public",
      allowIndexing: false,
    });

    expect(result).toEqual({
      status: "error",
      message: "게시 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });
});
