import { chromium, type FullConfig } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  authDirectory,
  createLiveAdminClient,
  deleteOwner,
  deleteRememberedOwner,
  forgetOwner,
  ownerStoragePath,
  removeOwnerArtifacts,
  rememberOwner,
} from "./live-owner";
import { diagnosticUrl } from "./live-diagnostics";

export default async function liveGlobalSetup(config: FullConfig) {
  const baseURL = String(config.projects[0]?.use.baseURL ?? "http://127.0.0.1:3000");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let createdUserId: string | null = null;

  try {
    await deleteRememberedOwner();
    await mkdir(authDirectory, { recursive: true, mode: 0o700 });

    const admin = createLiveAdminClient();
    const email = `informationboard-e2e-${randomUUID()}@example.test`;
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { data: { full_name: "InformationBoard E2E" } },
    });
    createdUserId = data.user?.id ?? null;
    if (error || !data.user || !data.properties.hashed_token) {
      throw new Error(
        `Could not create E2E owner: ${error?.message ?? "no token"}`,
      );
    }

    await rememberOwner(data.user.id);
    browser = await chromium.launch();
    const page = await browser.newPage();
    const redirects: Array<{
      status: number;
      url: string;
      location: string | null;
    }> = [];
    page.on("response", (response) => {
      const responseUrl = new URL(response.url());
      if (!["127.0.0.1", "localhost"].includes(responseUrl.hostname)) return;

      const location = response.headers()["location"];
      redirects.push({
        status: response.status(),
        url: diagnosticUrl(response.url()),
        location: location ? diagnosticUrl(location, responseUrl) : null,
      });
    });
    const confirmationUrl = new URL("/auth/confirm", baseURL);
    confirmationUrl.searchParams.set("token_hash", data.properties.hashed_token);
    confirmationUrl.searchParams.set("type", "email");
    confirmationUrl.searchParams.set("next", "/dashboard");
    await page.goto(confirmationUrl.toString());
    try {
      await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
    } catch (navigationError) {
      const cookies = await page.context().cookies();
      const diagnostic = {
        baseURL,
        finalUrl: diagnosticUrl(page.url()),
        redirects,
        cookies: cookies.map(({ name, domain, path, secure, sameSite }) => ({
          name,
          domain,
          path,
          secure,
          sameSite,
        })),
      };
      throw new Error(
        `Live owner confirmation did not reach the dashboard: ${JSON.stringify(diagnostic)}`,
        { cause: navigationError },
      );
    }
    await page.context().storageState({ path: ownerStoragePath });
  } catch (setupError) {
    const cleanupErrors: unknown[] = [];
    if (createdUserId) {
      try {
        await deleteOwner(createdUserId);
        await forgetOwner();
      } catch (error) {
        cleanupErrors.push(error);
        try {
          await rememberOwner(createdUserId);
        } catch (metadataError) {
          cleanupErrors.push(metadataError);
        }
      }
    }
    try {
      await removeOwnerArtifacts();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [setupError, ...cleanupErrors],
        "Live E2E setup and cleanup failed",
        { cause: setupError },
      );
    }
    throw setupError;
  } finally {
    await browser?.close();
  }
}
