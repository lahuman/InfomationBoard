import { describe, expect, it } from "vitest";
import {
  passwordPublicationInputSchema,
  privateDraftPublicationInputSchema,
  publicPublicationInputSchema,
  publicationInputSchema,
} from "../schema";

const identity = {
  id: "30000000-0000-4000-8000-000000000003",
  revision: 2,
};

describe("publication mutation schemas", () => {
  it("accepts the three explicit publication modes", () => {
    expect(
      publicPublicationInputSchema.parse({
        ...identity,
        mode: "public",
        allowIndexing: true,
      }),
    ).toEqual({ ...identity, mode: "public", allowIndexing: true });

    expect(
      passwordPublicationInputSchema.parse({
        ...identity,
        mode: "password",
        password: "여름-night-2026",
      }),
    ).toEqual({
      ...identity,
      mode: "password",
      password: "여름-night-2026",
    });

    expect(
      privateDraftPublicationInputSchema.parse({
        ...identity,
        mode: "private-draft",
      }),
    ).toEqual({ ...identity, mode: "private-draft" });
  });

  it("counts Unicode password characters and enforces the 8 to 128 boundary", () => {
    expect(
      passwordPublicationInputSchema.parse({
        ...identity,
        mode: "password",
        password: "🔐".repeat(8),
      }).password,
    ).toBe("🔐".repeat(8));

    expect(() =>
      passwordPublicationInputSchema.parse({
        ...identity,
        mode: "password",
        password: "🔐".repeat(7),
      }),
    ).toThrow();
    expect(() =>
      passwordPublicationInputSchema.parse({
        ...identity,
        mode: "password",
        password: "가".repeat(129),
      }),
    ).toThrow();
  });

  it("rejects fields that do not belong to the selected mode", () => {
    expect(() =>
      publicationInputSchema.parse({
        ...identity,
        mode: "public",
        allowIndexing: false,
        password: "must-not-leak",
      }),
    ).toThrow("Unrecognized key");

    expect(() =>
      publicationInputSchema.parse({
        ...identity,
        mode: "private-draft",
        allowIndexing: true,
      }),
    ).toThrow("Unrecognized key");
  });
});
