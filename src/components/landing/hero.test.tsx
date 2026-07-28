import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Hero } from "./hero";

it("offers one clear sign-in action and beta status", () => {
  render(<Hero />);

  expect(screen.getByText("무료 베타")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "무료로 안내판 만들기" }),
  ).toHaveAttribute("href", "/login");
});
