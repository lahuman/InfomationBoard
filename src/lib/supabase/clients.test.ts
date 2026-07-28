import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Supabase client boundaries", () => {
  it("keeps the secret key out of the browser client", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/supabase/client.ts"),
      "utf8",
    );
    expect(source).not.toContain("SUPABASE_SECRET_KEY");
    expect(source).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("marks the elevated client as server-only", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/supabase/admin.ts"),
      "utf8",
    );
    expect(source).toContain('import "server-only"');
    expect(source).toContain("SUPABASE_SECRET_KEY");
  });
});
