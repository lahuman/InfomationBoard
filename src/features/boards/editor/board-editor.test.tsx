import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BoardEditor } from "./board-editor";
import type { UpdateBoardResult } from "../actions/update-board";
import type { UpdateBoardInput } from "../schema";

const initialBoard = {
  id: "30000000-0000-4000-8000-000000000003",
  title: "여름 야시장",
  summary: "행사 요약",
  contentMarkdown: "# 안내",
  template: "event",
  theme: {
    palette: "coral" as const,
    density: "comfortable" as const,
    alignment: "left" as const,
  },
  revision: 2,
  updatedAt: "2026-07-28T10:00:00.000Z",
};

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

it("autosaves edited content after 750 ms", async () => {
  const update = vi.fn(
    async (): Promise<UpdateBoardResult> => ({
      status: "saved",
      revision: 3,
      updatedAt: "2026-07-28T10:01:00.000Z",
    }),
  );
  render(<BoardEditor board={initialBoard} updateBoardAction={update} />);

  const title = screen.getByLabelText("제목");
  fireEvent.change(title, { target: { value: "수정한 야시장" } });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(750);
  });

  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      id: initialBoard.id,
      revision: 2,
      title: "수정한 야시장",
    }),
  );
  expect(screen.getByText("저장됨")).toBeVisible();
  expect(window.localStorage.length).toBe(0);
});

it("preserves local input when the server reports a conflict", async () => {
  const update = vi.fn(
    async (): Promise<UpdateBoardResult> => ({
      status: "conflict",
      serverBoard: {
        ...initialBoard,
        title: "서버 제목",
        revision: 4,
      },
    }),
  );
  render(<BoardEditor board={initialBoard} updateBoardAction={update} />);

  const title = screen.getByLabelText("제목");
  fireEvent.change(title, { target: { value: "내 로컬 제목" } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(750);
  });

  expect(title).toHaveValue("내 로컬 제목");
  expect(screen.getByText("저장 충돌")).toBeVisible();
  expect(screen.getByRole("button", { name: "서버 내용 불러오기" })).toBeVisible();
  expect(window.localStorage.length).toBe(1);
});

it("coalesces edits made while a save request is in flight", async () => {
  let resolveFirst:
    | ((result: UpdateBoardResult) => void)
    | undefined;
  const firstSave = new Promise<UpdateBoardResult>((resolve) => {
    resolveFirst = resolve;
  });
  const update = vi
    .fn<(input: UpdateBoardInput) => Promise<UpdateBoardResult>>()
    .mockReturnValueOnce(firstSave)
    .mockResolvedValueOnce({
      status: "saved",
      revision: 4,
      updatedAt: "2026-07-28T10:02:00.000Z",
    });
  render(<BoardEditor board={initialBoard} updateBoardAction={update} />);

  const title = screen.getByLabelText("제목");
  fireEvent.change(title, { target: { value: "첫 번째 변경" } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(750);
  });
  expect(update).toHaveBeenCalledTimes(1);

  fireEvent.change(title, { target: { value: "가장 최신 변경" } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(750);
  });
  expect(update).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveFirst?.({
      status: "saved",
      revision: 3,
      updatedAt: "2026-07-28T10:01:00.000Z",
    });
    await firstSave;
  });

  expect(update).toHaveBeenCalledTimes(2);
  expect(update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      revision: 3,
      title: "가장 최신 변경",
    }),
  );
});

it("renders edit and preview tabs with the safe Markdown preview", () => {
  render(
    <BoardEditor
      board={{
        ...initialBoard,
        contentMarkdown: "<script>alert(1)</script>\n\n# 안전한 안내",
      }}
      updateBoardAction={vi.fn()}
    />,
  );

  expect(screen.getByRole("tab", { name: "편집" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("tab", { name: "미리보기" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "안전한 안내" })).toBeVisible();
  expect(document.querySelector("script")).toBeNull();
});
