import fixture from "../../../tests/fixtures/legacy-information.json";
import { describe, expect, it } from "vitest";
import { parseLegacyInformation } from "./schema";

describe("parseLegacyInformation", () => {
  it("accepts the archived md and qr shape", () => {
    expect(parseLegacyInformation(fixture)).toEqual(fixture);
  });

  it("rejects unexpected properties", () => {
    expect(() =>
      parseLegacyInformation({ ...fixture, password: "secret" }),
    ).toThrow("Unrecognized key");
  });

  it("rejects oversized markdown before import", () => {
    expect(() =>
      parseLegacyInformation({ md: "x".repeat(200_001), qr: fixture.qr }),
    ).toThrow("Markdown must be at most 200000 characters");
  });

  it("rejects unsafe QR URL protocols", () => {
    expect(() =>
      parseLegacyInformation({ md: fixture.md, qr: "javascript:alert(1)" }),
    ).toThrow("QR target must use http or https");
  });
});
