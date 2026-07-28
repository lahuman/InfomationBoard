import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import DashboardPage from "./page";

vi.mock("@/features/auth/require-user", () => ({
  requireUser: vi.fn(async () => ({
    id: "user-id",
    email: "owner@example.com",
  })),
}));

vi.mock("@/features/auth/actions", () => ({
  signOut: vi.fn(async () => undefined),
}));

it("renders the protected owner dashboard shell", async () => {
  render(await DashboardPage());

  expect(
    screen.getByRole("heading", { level: 1, name: "내 안내판" }),
  ).toBeVisible();
  expect(screen.getByText("owner@example.com")).toBeVisible();
  expect(screen.getByText("아직 만든 안내판이 없습니다.")).toBeVisible();
  expect(screen.getByRole("button", { name: "로그아웃" })).toBeVisible();
});
