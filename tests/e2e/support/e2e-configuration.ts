type E2EEnvironment = Readonly<Record<string, string | undefined>>;

export function resolvePlaywrightE2EEnvironment(
  environment: E2EEnvironment,
  managedOwnerPath: string,
) {
  const explicitOwnerStorageState =
    environment.E2E_OWNER_STORAGE_STATE?.trim() || undefined;
  const liveModeRequested = environment.E2E_LIVE_SUPABASE === "1";
  const useManagedLiveOwner =
    liveModeRequested && explicitOwnerStorageState === undefined;
  const useRealSupabase =
    liveModeRequested || explicitOwnerStorageState !== undefined;

  return {
    ownerStorageState:
      explicitOwnerStorageState ??
      (useManagedLiveOwner ? managedOwnerPath : undefined),
    useManagedLiveOwner,
    useRealSupabase,
  };
}
