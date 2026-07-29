import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./page";

const mocks = vi.hoisted(() => ({
  getDashboardData: vi.fn(),
}));

vi.mock("@/features/auth/require-user", () => ({
  requireUser: vi.fn(async () => ({
    id: "user-id",
    email: "owner@example.com",
  })),
}));

vi.mock("@/features/boards/queries", () => ({
  getDashboardData: mocks.getDashboardData,
}));

vi.mock("@/features/auth/actions", () => ({
  signOut: vi.fn(async () => undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDashboardData.mockResolvedValue({
    storageBytes: 0,
    boards: [],
  });
});

describe("DashboardPage", () => {
  it("renders the protected owner dashboard with an empty state", async () => {
    render(await DashboardPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "내 안내판" }),
    ).toBeVisible();
    expect(screen.getByText("owner@example.com")).toBeVisible();
    expect(screen.getByText("아직 만든 안내판이 없습니다.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "안내판 만들기" }),
    ).toHaveAttribute("href", "/boards/new");
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeVisible();
    expect(mocks.getDashboardData).toHaveBeenCalledWith("user-id");
  });

  it("renders loaded boards and storage use", async () => {
    mocks.getDashboardData.mockResolvedValue({
      storageBytes: 1_048_576,
      boards: [
        {
          id: "30000000-0000-4000-8000-000000000003",
          title: "여름 야시장",
          template: "event",
          status: "draft",
          revision: 2,
          updatedAt: "2026-07-28T10:00:00.000Z",
        },
      ],
    });

    render(await DashboardPage());

    expect(screen.getByText("여름 야시장")).toBeVisible();
    expect(screen.getByText("1 MB / 50 MB")).toBeVisible();
  });

  it("shows a safe retry state when dashboard loading fails", async () => {
    mocks.getDashboardData.mockRejectedValue(
      new Error("database internals must not render"),
    );

    render(await DashboardPage());

    expect(
      screen.getByRole("heading", {
        name: "안내판을 불러오지 못했습니다.",
      }),
    ).toBeVisible();
    expect(screen.queryByText("database internals must not render")).toBeNull();
  });
});
