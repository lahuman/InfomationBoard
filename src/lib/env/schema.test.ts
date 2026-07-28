import { describe, expect, it } from "vitest";
import { parsePublicEnv, parseServerEnv } from "./schema";

const publicSource = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000/",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co/",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

describe("parsePublicEnv", () => {
  it("normalizes the configured origins", () => {
    expect(parsePublicEnv(publicSource)).toEqual({
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    });
  });

  it("rejects legacy or missing publishable keys", () => {
    expect(() =>
      parsePublicEnv({
        ...publicSource,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "legacy-anon-key",
      }),
    ).toThrow("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });
});

describe("parseServerEnv", () => {
  it("requires a current secret key", () => {
    expect(() => parseServerEnv(publicSource)).toThrow("SUPABASE_SECRET_KEY");
  });

  it("accepts the server-only key without returning it from public parsing", () => {
    const server = parseServerEnv({
      ...publicSource,
      SUPABASE_SECRET_KEY: "sb_secret_test",
    });
    expect(server.SUPABASE_SECRET_KEY).toBe("sb_secret_test");
    expect(parsePublicEnv(publicSource)).not.toHaveProperty(
      "SUPABASE_SECRET_KEY",
    );
  });
});
