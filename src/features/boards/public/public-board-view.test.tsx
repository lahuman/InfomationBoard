import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicBoardView } from "./public-board-view";

const board = {
  id: "30000000-0000-4000-8000-000000000003",
  slug: "summer-night-market",
  title: "여름 야시장",
  summary: "첫째 줄\n둘째 줄",
  contentMarkdown:
    "## 운영 시간\n\n금요일 오후 6시\n\n<script>alert('x')</script>",
  template: "event" as const,
  theme: {
    palette: "coral" as const,
    density: "comfortable" as const,
    alignment: "left" as const,
  },
  allowIndexing: true,
  updatedAt: "2026-07-28T10:00:00.000Z",
  publishedAt: "2026-07-28T09:00:00.000Z",
};

describe("PublicBoardView", () => {
  it("renders the published board with its controlled theme", () => {
    render(<PublicBoardView board={board} />);

    expect(
      screen.getByRole("heading", { name: "여름 야시장", level: 1 }),
    ).toBeVisible();
    expect(screen.getByText("행사 안내")).toBeVisible();
    expect(screen.getByTestId("public-board-summary").textContent).toBe(
      board.summary,
    );
    expect(screen.getByTestId("public-board-summary").tagName).toBe("P");
    expect(
      screen.getByRole("heading", { name: "운영 시간", level: 2 }),
    ).toBeVisible();
    expect(screen.queryByText("alert('x')")).not.toBeInTheDocument();

    expect(screen.getByRole("main")).toHaveClass(
      "theme-coral",
      "density-comfortable",
      "align-left",
    );
  });

  it("keeps empty summaries out of the document", () => {
    render(<PublicBoardView board={{ ...board, summary: "" }} />);
    expect(screen.queryByTestId("public-board-summary")).not.toBeInTheDocument();
  });
});
