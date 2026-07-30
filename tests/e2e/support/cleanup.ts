type E2ECleanup = () => Promise<unknown>;

export async function runE2EScenarioWithCleanup(
  scenario: () => Promise<void>,
  cleanups: readonly E2ECleanup[],
): Promise<void> {
  let scenarioFailure: { error: unknown } | undefined;
  try {
    await scenario();
  } catch (error) {
    scenarioFailure = { error };
  }

  const cleanupResults = await Promise.allSettled(
    cleanups.map((cleanup) => Promise.resolve().then(cleanup)),
  );
  const cleanupErrors = cleanupResults.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );

  if (scenarioFailure) throw scenarioFailure.error;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "E2E scenario cleanup failed");
  }
}
