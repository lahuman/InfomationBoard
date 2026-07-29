import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import HomePage from "./page";

it("presents the three approved use cases", () => {
  render(<HomePage />);

  expect(
    screen.getByRole("heading", { level: 1, name: /한 번 만들고/ }),
  ).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "매장 안내" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "행사 안내" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "모임 안내" })).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /매장 안내 샘플 보드 보기/ }),
  ).toHaveAttribute("href", "/examples/cafe-guide");
  expect(
    screen.getByRole("link", { name: /행사 안내 샘플 보드 보기/ }),
  ).toHaveAttribute("href", "/examples/summer-festival");
  expect(
    screen.getByRole("link", { name: /모임 안내 샘플 보드 보기/ }),
  ).toHaveAttribute("href", "/examples/book-club");
});
