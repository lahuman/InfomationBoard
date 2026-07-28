import { describe, expect, it } from "vitest";
import {
  boardDraftSchema,
  boardThemeSchema,
  createBoardInputSchema,
  updateBoardInputSchema,
} from "./schema";

const validDraft = {
  title: "여름 야시장",
  summary: "도심에서 만나는 여름밤 행사",
  contentMarkdown: "# 행사 안내",
  template: "event" as const,
  theme: {
    palette: "coral" as const,
    density: "comfortable" as const,
    alignment: "left" as const,
  },
};

describe("boardThemeSchema", () => {
  it("accepts only controlled theme tokens", () => {
    expect(boardThemeSchema.parse(validDraft.theme)).toEqual(validDraft.theme);
    expect(() =>
      boardThemeSchema.parse({
        ...validDraft.theme,
        customCss: "body { display: none }",
      }),
    ).toThrow("Unrecognized key");
  });
});

describe("boardDraftSchema", () => {
  it("accepts a valid board draft", () => {
    expect(boardDraftSchema.parse(validDraft)).toEqual(validDraft);
  });

  it("enforces database and product length limits", () => {
    expect(() =>
      boardDraftSchema.parse({ ...validDraft, title: "x".repeat(121) }),
    ).toThrow();
    expect(() =>
      boardDraftSchema.parse({ ...validDraft, summary: "x".repeat(301) }),
    ).toThrow();
    expect(() =>
      boardDraftSchema.parse({
        ...validDraft,
        contentMarkdown: "x".repeat(200_001),
      }),
    ).toThrow();
  });

  it("rejects unsupported templates", () => {
    expect(() =>
      boardDraftSchema.parse({ ...validDraft, template: "custom" }),
    ).toThrow();
  });
});

describe("board mutation schemas", () => {
  it("accepts template-based creation", () => {
    expect(createBoardInputSchema.parse({ template: "store" })).toEqual({
      template: "store",
    });
  });

  it("requires a positive safe revision for updates", () => {
    const input = {
      id: "30000000-0000-4000-8000-000000000003",
      revision: 2,
      title: validDraft.title,
      summary: validDraft.summary,
      contentMarkdown: validDraft.contentMarkdown,
      theme: validDraft.theme,
    };

    expect(updateBoardInputSchema.parse(input)).toEqual(input);
    expect(() =>
      updateBoardInputSchema.parse({ ...input, revision: 0 }),
    ).toThrow();
  });
});

