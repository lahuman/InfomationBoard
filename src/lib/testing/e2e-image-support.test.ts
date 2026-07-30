import { describe, expect, it } from "vitest";
import { runE2EScenarioWithCleanup } from "../../../tests/e2e/support/cleanup";
import { resolvePlaywrightE2EEnvironment } from "../../../tests/e2e/support/e2e-configuration";
import { parseExactStorageMeterBytes } from "../../../tests/e2e/support/image-meter";

describe("E2E scenario cleanup arbitration", () => {
  it("runs both cleanup paths after a post-creation scenario failure", async () => {
    const events: string[] = [];

    await runE2EScenarioWithCleanup(
      async () => {
        events.push("board created");
        throw new Error("scenario failed");
      },
      [
        async () => {
          events.push("anonymous context closed");
        },
        async () => {
          events.push("board deleted");
        },
      ],
    ).catch(() => undefined);

    expect(events).toEqual([
      "board created",
      "anonymous context closed",
      "board deleted",
    ]);
  });

  it("preserves the scenario error when cleanup also rejects", async () => {
    const scenarioError = new Error("scenario failed");
    const cleanupError = new Error("cleanup failed");

    await expect(
      runE2EScenarioWithCleanup(
        async () => {
          throw scenarioError;
        },
        [async () => Promise.reject(cleanupError)],
      ),
    ).rejects.toBe(scenarioError);
  });

  it("surfaces cleanup rejection after a successful scenario", async () => {
    const cleanupError = new Error("cleanup failed");
    let laterCleanupRan = false;

    try {
      await runE2EScenarioWithCleanup(async () => undefined, [
        async () => Promise.reject(cleanupError),
        async () => {
          laterCleanupRan = true;
        },
      ]);
      throw new Error("expected cleanup to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([cleanupError]);
    }
    expect(laterCleanupRan).toBe(true);
  });
});

describe("Playwright Supabase environment selection", () => {
  const managedOwnerPath = "/workspace/.playwright/.auth/owner.json";

  it("keeps anonymous browser checks on the fake test configuration", () => {
    expect(resolvePlaywrightE2EEnvironment({}, managedOwnerPath)).toEqual({
      ownerStorageState: undefined,
      useManagedLiveOwner: false,
      useRealSupabase: false,
    });
  });

  it("uses real Supabase configuration for an explicit owner storage state without replacing that owner", () => {
    expect(
      resolvePlaywrightE2EEnvironment(
        { E2E_OWNER_STORAGE_STATE: "/secure/existing-owner.json" },
        managedOwnerPath,
      ),
    ).toEqual({
      ownerStorageState: "/secure/existing-owner.json",
      useManagedLiveOwner: false,
      useRealSupabase: true,
    });
  });

  it("creates a managed owner only for live mode without an explicit storage state", () => {
    expect(
      resolvePlaywrightE2EEnvironment(
        { E2E_LIVE_SUPABASE: "1" },
        managedOwnerPath,
      ),
    ).toEqual({
      ownerStorageState: managedOwnerPath,
      useManagedLiveOwner: true,
      useRealSupabase: true,
    });
  });

  it("keeps an explicit owner when live mode is also requested", () => {
    expect(
      resolvePlaywrightE2EEnvironment(
        {
          E2E_LIVE_SUPABASE: "1",
          E2E_OWNER_STORAGE_STATE: "/secure/existing-owner.json",
        },
        managedOwnerPath,
      ),
    ).toEqual({
      ownerStorageState: "/secure/existing-owner.json",
      useManagedLiveOwner: false,
      useRealSupabase: true,
    });
  });
});

describe("exact image meter values", () => {
  it.each([
    ["0", 0],
    ["68", 68],
    [" 1048576 ", 1_048_576],
    ["52428800", 52_428_800],
  ])("parses %j as exact stored bytes", (value, expected) => {
    expect(parseExactStorageMeterBytes(value)).toBe(expected);
  });

  it.each([null, "", "1.5 MB", "1.5", "-1", "1e3", "52428801"])(
    "rejects non-exact meter value %j",
    (value) => {
      expect(() => parseExactStorageMeterBytes(value)).toThrow(
        "Invalid image storage meter value",
      );
    },
  );
});
