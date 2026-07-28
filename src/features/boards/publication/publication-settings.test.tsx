import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishBoardResult } from "../actions/publish-board";
import { PublicationSettings } from "./publication-settings";

const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

const publicBoard = {
  id: "30000000-0000-4000-8000-000000000003",
  revision: 2,
  status: "published" as const,
  visibility: "public" as const,
  allowIndexing: true,
  publishedAt: "2026-07-28T09:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PublicationSettings", () => {
  it("shows lifecycle, canonical URL, visibility, and indexing state", () => {
    render(
      <PublicationSettings
        board={publicBoard}
        canonicalUrl="https://boards.example/b/summer-night-market"
        revision={publicBoard.revision}
        onRevisionChange={vi.fn()}
        publishBoardAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "게시 설정" })).toBeVisible();
    expect(screen.getByText("게시됨")).toBeVisible();
    expect(screen.getAllByText("전체 공개")).toHaveLength(2);
    expect(screen.getByText("검색 노출 허용")).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: "https://boards.example/b/summer-night-market",
      }),
    ).toHaveAttribute(
      "href",
      "https://boards.example/b/summer-night-market",
    );
    expect(screen.getByRole("heading", { name: "QR 공유" })).toBeVisible();
    expect(screen.getByRole("img", { name: "안내판 QR 미리보기" })).toBeVisible();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "검색엔진 노출 허용" }),
    );
    expect(screen.getByText("검색 노출 허용")).toBeVisible();
  });

  it("publishes with a transient password and clears it after success", async () => {
    const publish = vi.fn(
      async (): Promise<PublishBoardResult> => ({
        status: "saved",
        revision: 3,
        updatedAt: "2026-07-28T10:00:00.000Z",
      }),
    );
    const onRevisionChange = vi.fn();
    render(
      <PublicationSettings
        board={{
          ...publicBoard,
          status: "draft",
          visibility: "private",
          allowIndexing: false,
          publishedAt: null,
        }}
        canonicalUrl="https://boards.example/b/summer-night-market"
        revision={publicBoard.revision}
        onRevisionChange={onRevisionChange}
        publishBoardAction={publish}
      />,
    );

    fireEvent.click(
      screen.getByRole("radio", { name: /비밀번호 보호/ }),
    );
    const password = screen.getByLabelText(/방문 비밀번호/, {
      selector: 'input[type="password"]',
    });
    fireEvent.change(password, { target: { value: "owner-password" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "게시 설정 저장" }));
    });

    expect(publish).toHaveBeenCalledWith({
      id: publicBoard.id,
      revision: 2,
      mode: "password",
      password: "owner-password",
    });
    expect(password).toHaveValue("");
    expect(onRevisionChange).toHaveBeenCalledWith(3);
    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("requires confirmation before withdrawing a published board", async () => {
    const publish = vi.fn(
      async (): Promise<PublishBoardResult> => ({
        status: "saved",
        revision: 3,
        updatedAt: "2026-07-28T10:00:00.000Z",
      }),
    );
    render(
      <PublicationSettings
        board={publicBoard}
        canonicalUrl="https://boards.example/b/summer-night-market"
        revision={publicBoard.revision}
        onRevisionChange={vi.fn()}
        publishBoardAction={publish}
      />,
    );

    fireEvent.click(
      screen.getByRole("radio", { name: /비공개 초안/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "게시 설정 저장" }));

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(publish).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "공개 중단" }));
    });
    expect(publish).toHaveBeenCalledWith({
      id: publicBoard.id,
      revision: 2,
      mode: "private-draft",
    });
  });
});
