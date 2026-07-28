import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/boards/new?template=event", "/boards/new?template=event"],
    ["https://evil.test", "/dashboard"],
    ["//evil.test", "/dashboard"],
    ["javascript:alert(1)", "/dashboard"],
    ["%2F%2Fevil.test", "/dashboard"],
    ["/dashboard%0d%0aSet-Cookie:bad", "/dashboard"],
    [null, "/dashboard"],
  ])("maps %s to %s", (value, expected) => {
    expect(safeNextPath(value)).toBe(expected);
  });
});
