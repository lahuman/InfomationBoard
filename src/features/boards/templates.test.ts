import { describe, expect, it } from "vitest";
import { boardDraftSchema } from "./schema";
import { BOARD_TEMPLATES, getBoardTemplate } from "./templates";

describe("BOARD_TEMPLATES", () => {
  it("defines valid store, event, and meeting starter drafts", () => {
    expect(Object.keys(BOARD_TEMPLATES)).toEqual([
      "store",
      "event",
      "meeting",
    ]);

    for (const definition of Object.values(BOARD_TEMPLATES)) {
      expect(boardDraftSchema.parse(definition.defaults)).toEqual(
        definition.defaults,
      );
      expect(definition.label).not.toHaveLength(0);
      expect(definition.description).not.toHaveLength(0);
    }
  });

  it("returns the selected template definition", () => {
    expect(getBoardTemplate("event")).toBe(BOARD_TEMPLATES.event);
  });
});

