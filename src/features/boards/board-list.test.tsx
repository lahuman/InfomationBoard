import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BoardList } from "./board-list";

describe("BoardList", () => {
  it("renders an actionable empty state", () => {
    render(<BoardList boards={[]} />);

    expect(screen.getByText("아직 만든 안내판이 없습니다.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "첫 안내판 만들기" }),
    ).toHaveAttribute("href", "/boards/new");
  });

  it("renders owner boards with template, status, and edit links", () => {
    render(
      <BoardList
        boards={[
          {
            id: "30000000-0000-4000-8000-000000000003",
            title: "여름 야시장",
            template: "event",
            status: "draft",
            revision: 3,
            updatedAt: "2026-07-28T10:00:00.000Z",
          },
          {
            id: "40000000-0000-4000-8000-000000000004",
            title: "",
            template: "store",
            status: "published",
            revision: 1,
            updatedAt: "2026-07-27T10:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "여름 야시장 편집" })).toHaveAttribute(
      "href",
      "/boards/30000000-0000-4000-8000-000000000003/edit",
    );
    expect(screen.getByText("행사 안내")).toBeVisible();
    expect(screen.getByText("초안")).toBeVisible();
    expect(screen.getByText("제목 없는 안내판")).toBeVisible();
    expect(screen.getByText("게시됨")).toBeVisible();
    expect(screen.getAllByRole("time")).toHaveLength(2);
  });
});

