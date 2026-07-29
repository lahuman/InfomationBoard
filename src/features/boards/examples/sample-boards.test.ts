import { describe, expect, it } from "vitest";
import {
  SAMPLE_BOARDS,
  SAMPLE_BOARD_SLUGS,
  getSampleBoard,
} from "./sample-boards";

describe("sample board catalogue", () => {
  it("provides the three ordered landing examples", () => {
    expect(
      SAMPLE_BOARDS.map(({ number, label, slug }) => ({
        number,
        label,
        slug,
      })),
    ).toEqual([
      { number: "01", label: "매장 안내", slug: "cafe-guide" },
      { number: "02", label: "행사 안내", slug: "summer-festival" },
      { number: "03", label: "모임 안내", slug: "book-club" },
    ]);
    expect(SAMPLE_BOARD_SLUGS).toEqual([
      "cafe-guide",
      "summer-festival",
      "book-club",
    ]);
  });

  it("resolves known samples and rejects unknown slugs", () => {
    expect(getSampleBoard("summer-festival")?.board.title).toBe(
      "한강 여름 음악 축제",
    );
    expect(getSampleBoard("missing-example")).toBeNull();
  });

  it("contains complete non-indexable boards with distinct themes", () => {
    expect(SAMPLE_BOARDS.map(({ board }) => board.theme.palette)).toEqual([
      "lime",
      "coral",
      "blue",
    ]);

    for (const { board } of SAMPLE_BOARDS) {
      expect(board.title.length).toBeGreaterThan(0);
      expect(board.summary.length).toBeGreaterThan(0);
      expect(board.contentMarkdown).toContain("## ");
      expect(board.allowIndexing).toBe(false);
    }
  });
});
