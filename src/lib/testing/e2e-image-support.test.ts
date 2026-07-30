import { describe, expect, it } from "vitest";
import { resolvePlaywrightE2EEnvironment } from "../../../tests/e2e/support/e2e-configuration";
import { parseExactStorageMeterBytes } from "../../../tests/e2e/support/image-meter";

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
