import { describe, expect, it } from "vitest";
import { parseAppEnv } from "./schema";

describe("parseAppEnv", () => {
  it("accepts and normalizes an http application URL", () => {
    expect(
      parseAppEnv({ NEXT_PUBLIC_APP_URL: "http://localhost:3000/" }),
    ).toEqual({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
  });

  it("rejects a missing application URL", () => {
    expect(() => parseAppEnv({})).toThrow(
      "NEXT_PUBLIC_APP_URL: Invalid input: expected string",
    );
  });

  it("rejects non-http protocols", () => {
    expect(() =>
      parseAppEnv({ NEXT_PUBLIC_APP_URL: "javascript:alert(1)" }),
    ).toThrow("NEXT_PUBLIC_APP_URL: URL must use http or https");
  });
});
