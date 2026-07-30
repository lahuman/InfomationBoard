import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import path from "node:path";
import { resolvePlaywrightE2EEnvironment } from "./tests/e2e/support/e2e-configuration";

const managedOwnerPath = path.join(
  process.cwd(),
  ".playwright/.auth/owner.json",
);
const { useManagedLiveOwner, useRealSupabase } =
  resolvePlaywrightE2EEnvironment(process.env, managedOwnerPath);
if (useRealSupabase) loadEnvConfig(process.cwd());
const baseURL = useRealSupabase
  ? "http://localhost:3000"
  : "http://127.0.0.1:3000";

function requiredLiveEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for live Supabase E2E`);
  return value;
}

const serverEnv = useRealSupabase
  ? {
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_SUPABASE_URL: requiredLiveEnv("NEXT_PUBLIC_SUPABASE_URL"),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: requiredLiveEnv(
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      ),
      SUPABASE_SECRET_KEY: requiredLiveEnv("SUPABASE_SECRET_KEY"),
    }
  : {
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ci_test",
      SUPABASE_SECRET_KEY: "sb_secret_ci_test",
    };

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: useManagedLiveOwner
    ? "./tests/e2e/support/live-global-setup.ts"
    : undefined,
  globalTeardown: useManagedLiveOwner
    ? "./tests/e2e/support/live-global-teardown.ts"
    : undefined,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    env: serverEnv,
    url: baseURL,
    reuseExistingServer: useRealSupabase ? false : !process.env.CI,
    timeout: 120_000,
  },
});
