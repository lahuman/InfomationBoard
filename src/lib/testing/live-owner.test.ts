import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteUser: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { admin: { deleteUser: mocks.deleteUser } },
  }),
}));

import {
  deleteRememberedOwner,
  rememberOwner,
} from "../../../tests/e2e/support/live-owner";

let temporaryDirectory: string;
let paths: { authDirectory: string; cleanupMetadataPath: string };

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "informationboard-live-owner-"),
  );
  paths = {
    authDirectory: path.join(temporaryDirectory, ".auth"),
    cleanupMetadataPath: path.join(temporaryDirectory, "owner-cleanup.json"),
  };
  await rememberOwner("30000000-0000-4000-8000-000000000003", paths);
});

afterEach(async () => {
  await rm(temporaryDirectory, { force: true, recursive: true });
});

it("removes local authentication artifacts when remote cleanup fails", async () => {
  mocks.deleteUser.mockResolvedValue({
    error: { message: "temporary remote failure" },
  });

  await expect(deleteRememberedOwner(paths)).rejects.toThrow(
    "Could not delete E2E owner",
  );

  await expect(access(paths.authDirectory)).rejects.toThrow();
  await expect(access(paths.cleanupMetadataPath)).resolves.toBeUndefined();

  mocks.deleteUser.mockResolvedValue({ error: null });
  await expect(deleteRememberedOwner(paths)).resolves.toBeUndefined();
  await expect(access(paths.cleanupMetadataPath)).rejects.toThrow();
});
