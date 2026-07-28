import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import HomePage from "./page";

it("introduces InformationBoard as a free beta", () => {
  render(<HomePage />);

  expect(
    screen.getByRole("heading", { level: 1, name: "InformationBoard" }),
  ).toBeInTheDocument();
  expect(screen.getByText("무료 베타")).toBeInTheDocument();
});
