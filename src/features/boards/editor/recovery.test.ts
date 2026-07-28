import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRecoveryCopy,
  loadRecoveryCopy,
  saveRecoveryCopy,
} from "./recovery";

const boardId = "30000000-0000-4000-8000-000000000003";
const copy = {
  savedAt: "2026-07-28T10:05:00.000Z",
  revision: 2,
  draft: {
    title: "복구 제목",
    summary: "복구 요약",
    contentMarkdown: "# 복구",
    theme: {
      palette: "coral" as const,
      density: "comfortable" as const,
      alignment: "left" as const,
    },
  },
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("editor recovery copy", () => {
  it("round-trips a validated local draft", () => {
    saveRecoveryCopy(boardId, copy);
    expect(loadRecoveryCopy(boardId)).toEqual(copy);
  });

  it("drops malformed or mismatched local data", () => {
    window.localStorage.setItem(
      `informationboard:recovery:${boardId}`,
      JSON.stringify({ ...copy, revision: 0 }),
    );
    expect(loadRecoveryCopy(boardId)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it("clears a saved copy after persistence", () => {
    saveRecoveryCopy(boardId, copy);
    clearRecoveryCopy(boardId);
    expect(loadRecoveryCopy(boardId)).toBeNull();
  });
});

