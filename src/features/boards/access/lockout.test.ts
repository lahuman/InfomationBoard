import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPasswordFailures,
  getPasswordLock,
  recordPasswordFailure,
} from "./lockout";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

beforeEach(() => vi.clearAllMocks());

describe("password lockout service", () => {
  it("recognizes an active lock", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ locked_until: "2026-07-28T12:15:00.000Z" }],
      error: null,
    });
    await expect(
      getPasswordLock("53000000-0000-4000-8000-000000000001", "a".repeat(64)),
    ).resolves.toEqual({ lockedUntil: "2026-07-28T12:15:00.000Z" });
  });

  it("reports the fifth failure as locked", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          failed_count: 5,
          locked_until: "2026-07-28T12:15:00.000Z",
        },
      ],
      error: null,
    });
    await expect(
      recordPasswordFailure(
        "53000000-0000-4000-8000-000000000001",
        "a".repeat(64),
      ),
    ).resolves.toEqual({ failedCount: 5, locked: true });
  });

  it("clears the keyed record after success", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(
      clearPasswordFailures(
        "53000000-0000-4000-8000-000000000001",
        "a".repeat(64),
      ),
    ).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "clear_password_failures_for_server",
      expect.any(Object),
    );
  });
});
