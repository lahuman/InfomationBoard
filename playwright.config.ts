import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

const useLiveSupabase = process.env.E2E_LIVE_SUPABASE === "1";
if (useLiveSupabase) loadEnvConfig(process.cwd());
const baseURL = useLiveSupabase
  ? "http://localhost:3000"
  : "http://127.0.0.1:3000";

function requiredLiveEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for live Supabase E2E`);
  return value;
}

const serverEnv = useLiveSupabase
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
  globalSetup: useLiveSupabase
    ? "./tests/e2e/support/live-global-setup.ts"
    : undefined,
  globalTeardown: useLiveSupabase
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
    reuseExistingServer: useLiveSupabase ? false : !process.env.CI,
    timeout: 120_000,
  },
});
