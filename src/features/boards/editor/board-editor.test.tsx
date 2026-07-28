import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BoardEditor } from "./board-editor";
import type { DeleteBoardResult } from "../actions/delete-board";
import type { PublishBoardResult } from "../actions/publish-board";
import type { UpdateBoardResult } from "../actions/update-board";
import type { UpdateBoardInput } from "../schema";

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

const initialBoard = {
  id: "30000000-0000-4000-8000-000000000003",
  slug: "summer-night-market",
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
  status: "draft" as const,
  visibility: "private" as const,
  allowIndexing: false,
  publishedAt: null,
};

const publicationProps = {
  canonicalUrl: "https://boards.example/b/summer-night-market",
  publishBoardAction: vi.fn(),
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
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
  render(
    <BoardEditor
      {...publicationProps}
      board={initialBoard}
      deleteBoardAction={vi.fn()}
      updateBoardAction={update}
    />,
  );

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

it("uses the publication revision for the next autosave", async () => {
  const publish = vi.fn(
    async (): Promise<PublishBoardResult> => ({
      status: "saved",
      revision: 3,
      updatedAt: "2026-07-28T10:01:00.000Z",
    }),
  );
  const update = vi.fn(
    async (): Promise<UpdateBoardResult> => ({
      status: "saved",
      revision: 4,
      updatedAt: "2026-07-28T10:02:00.000Z",
    }),
  );
  render(
    <BoardEditor
      board={initialBoard}
      canonicalUrl={publicationProps.canonicalUrl}
      deleteBoardAction={vi.fn()}
      publishBoardAction={publish}
      updateBoardAction={update}
    />,
  );

  fireEvent.click(screen.getByRole("radio", { name: /전체 공개/ }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "게시 설정 저장" }));
  });
  fireEvent.change(screen.getByLabelText("제목"), {
    target: { value: "게시 후 수정" },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(750);
  });

  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ revision: 3, title: "게시 후 수정" }),
  );
});

it("uses the autosave revision when publishing edited content", async () => {
  const update = vi.fn(
    async (): Promise<UpdateBoardResult> => ({
      status: "saved",
      revision: 3,
      updatedAt: "2026-07-28T10:01:00.000Z",
    }),
  );
  const publish = vi.fn(
    async (): Promise<PublishBoardResult> => ({
      status: "saved",
      revision: 4,
      updatedAt: "2026-07-28T10:02:00.000Z",
    }),
  );
  render(
    <BoardEditor
      board={initialBoard}
      canonicalUrl={publicationProps.canonicalUrl}
      deleteBoardAction={vi.fn()}
      publishBoardAction={publish}
      updateBoardAction={update}
    />,
  );

  fireEvent.change(screen.getByLabelText("제목"), {
    target: { value: "게시 전 수정" },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(750);
  });
  fireEvent.click(screen.getByRole("radio", { name: /전체 공개/ }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "게시 설정 저장" }));
  });

  expect(publish).toHaveBeenCalledWith(
    expect.objectContaining({ revision: 3, mode: "public" }),
  );
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
  render(
    <BoardEditor
      {...publicationProps}
      board={initialBoard}
      deleteBoardAction={vi.fn()}
      updateBoardAction={update}
    />,
  );

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
  render(
    <BoardEditor
      {...publicationProps}
      board={initialBoard}
      deleteBoardAction={vi.fn()}
      updateBoardAction={update}
    />,
  );

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
      {...publicationProps}
      board={{
        ...initialBoard,
        contentMarkdown: "<script>alert(1)</script>\n\n# 안전한 안내",
      }}
      deleteBoardAction={vi.fn()}
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

it("requires explicit confirmation before deleting a board", () => {
  const remove = vi.fn();
  render(
    <BoardEditor
      {...publicationProps}
      board={initialBoard}
      deleteBoardAction={remove}
      updateBoardAction={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "안내판 삭제" }));

  expect(screen.getByRole("dialog")).toBeVisible();
  expect(
    screen.getByRole("heading", {
      name: "‘여름 야시장’을 삭제할까요?",
    }),
  ).toBeVisible();
  expect(remove).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(remove).not.toHaveBeenCalled();
});

it("deletes after confirmation, clears recovery, and returns to dashboard", async () => {
  const remove = vi.fn(
    async (): Promise<DeleteBoardResult> => ({ status: "deleted" }),
  );
  render(
    <BoardEditor
      {...publicationProps}
      board={initialBoard}
      deleteBoardAction={remove}
      updateBoardAction={vi.fn()}
    />,
  );

  fireEvent.change(screen.getByLabelText("제목"), {
    target: { value: "삭제할 안내판" },
  });
  expect(window.localStorage.length).toBe(1);

  fireEvent.click(screen.getByRole("button", { name: "안내판 삭제" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "영구 삭제" }));
  });

  expect(remove).toHaveBeenCalledWith({ id: initialBoard.id });
  expect(window.localStorage.length).toBe(0);
  expect(routerMocks.replace).toHaveBeenCalledWith("/dashboard");
  expect(routerMocks.refresh).toHaveBeenCalledOnce();
});

it("keeps the confirmation open when deletion fails", async () => {
  const remove = vi.fn(
    async (): Promise<DeleteBoardResult> => ({
      status: "error",
      message: "안내판을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    }),
  );
  render(
    <BoardEditor
      {...publicationProps}
      board={initialBoard}
      deleteBoardAction={remove}
      updateBoardAction={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "안내판 삭제" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "영구 삭제" }));
  });

  expect(screen.getByRole("alert")).toHaveTextContent(
    "안내판을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(routerMocks.replace).not.toHaveBeenCalled();
});
