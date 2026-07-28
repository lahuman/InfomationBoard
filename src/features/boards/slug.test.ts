import { describe, expect, it } from "vitest";
import {
  BOARD_SLUG_LENGTH,
  BOARD_SLUG_PATTERN,
  generateBoardSlug,
} from "./slug";

describe("generateBoardSlug", () => {
  it("creates lowercase alphanumeric slugs accepted by the database", () => {
    const slugs = Array.from({ length: 64 }, () => generateBoardSlug());

    for (const slug of slugs) {
      expect(slug).toHaveLength(BOARD_SLUG_LENGTH);
      expect(slug).toMatch(BOARD_SLUG_PATTERN);
    }
    expect(new Set(slugs)).toHaveLength(slugs.length);
  });
});

