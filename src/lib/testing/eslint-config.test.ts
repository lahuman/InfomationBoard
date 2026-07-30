import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

describe("ESLint generated-file boundaries", () => {
  it("ignores Supabase CLI temporary output without ignoring application code", async () => {
    const eslint = new ESLint({
      cwd: process.cwd(),
      overrideConfigFile: "eslint.config.mjs",
    });

    await expect(
      eslint.isPathIgnored(
        "supabase/.temp/start-secrets/runtime/main/index.ts",
      ),
    ).resolves.toBe(true);
    await expect(eslint.isPathIgnored("src/app/page.tsx")).resolves.toBe(false);
  });
});
