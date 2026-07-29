import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { SampleBoardPageView } from "./sample-board-page";
import { SAMPLE_BOARDS } from "./sample-boards";

it("labels the page as a sample and provides both next actions", () => {
  const sample = SAMPLE_BOARDS[0];
  render(<SampleBoardPageView sample={sample} />);

  expect(screen.getByText("활용 예시 · 매장 안내")).toBeVisible();
  expect(
    screen.getByRole("heading", { name: sample.board.title, level: 1 }),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: "내 안내판 만들기" }),
  ).toHaveAttribute("href", "/login");
  expect(
    screen.getByRole("link", { name: "다른 예시 보기" }),
  ).toHaveAttribute("href", "/#examples");
  expect(screen.queryByText("게시된 안내판")).not.toBeInTheDocument();
});
