import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

type LiveOwnerPaths = {
  authDirectory: string;
  cleanupMetadataPath: string;
};

const playwrightDirectory = path.join(process.cwd(), ".playwright");
export const authDirectory = path.join(playwrightDirectory, ".auth");
export const ownerStoragePath = path.join(authDirectory, "owner.json");
const defaultPaths: LiveOwnerPaths = {
  authDirectory,
  cleanupMetadataPath: path.join(playwrightDirectory, "owner-cleanup.json"),
};

type OwnerMetadata = { userId: string };

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Live Supabase E2E environment is missing");

  return createClient(url, secret, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export async function rememberOwner(
  userId: string,
  paths: LiveOwnerPaths = defaultPaths,
) {
  await mkdir(path.dirname(paths.cleanupMetadataPath), {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(paths.cleanupMetadataPath, JSON.stringify({ userId }), {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function forgetOwner(paths: LiveOwnerPaths = defaultPaths) {
  await rm(paths.cleanupMetadataPath, { force: true });
}

export async function deleteOwner(userId: string) {
  let lastError: { message: string } | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { error } = await adminClient().auth.admin.deleteUser(userId);
    if (!error) return;
    lastError = error;
  }
  throw new Error(`Could not delete E2E owner: ${lastError?.message}`);
}

export async function removeOwnerArtifacts(
  paths: LiveOwnerPaths = defaultPaths,
) {
  await rm(paths.authDirectory, { force: true, recursive: true });
}

export async function deleteRememberedOwner(
  paths: LiveOwnerPaths = defaultPaths,
) {
  let metadata: OwnerMetadata | null = null;
  try {
    metadata = JSON.parse(
      await readFile(paths.cleanupMetadataPath, "utf8"),
    ) as OwnerMetadata;
  } catch {
    // No recorded test user exists.
  }

  let remoteError: unknown;
  try {
    if (metadata?.userId) {
      await deleteOwner(metadata.userId);
      await forgetOwner(paths);
    }
  } catch (error) {
    remoteError = error;
  }

  let localError: unknown;
  try {
    await removeOwnerArtifacts(paths);
  } catch (error) {
    localError = error;
  }

  if (remoteError && localError) {
    throw new AggregateError(
      [remoteError, localError],
      "Could not fully clean up the E2E owner",
    );
  }
  if (remoteError) throw remoteError;
  if (localError) throw localError;
}

export function createLiveAdminClient() {
  return adminClient();
}
