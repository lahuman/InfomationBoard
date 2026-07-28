import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import NewBoardPage from "./page";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({
    id: "user-id",
    email: "owner@example.com",
  })),
  createBoard: vi.fn(),
}));

vi.mock("@/features/auth/require-user", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/features/boards/actions/create-board", () => ({
  createBoard: mocks.createBoard,
}));

it("protects and renders the template selection page", async () => {
  render(await NewBoardPage());

  expect(mocks.requireUser).toHaveBeenCalledWith("/boards/new");
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "어떤 안내판을 만들까요?",
    }),
  ).toBeVisible();
  expect(screen.getAllByRole("radio")).toHaveLength(3);
  expect(screen.getByText("owner@example.com")).toBeVisible();
});

