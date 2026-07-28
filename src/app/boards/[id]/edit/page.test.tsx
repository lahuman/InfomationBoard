import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import EditBoardPage from "./page";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getBoardForEditor: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/features/auth/require-user", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/features/boards/editor/queries", () => ({
  getBoardForEditor: mocks.getBoardForEditor,
}));

vi.mock("@/features/boards/actions/update-board", () => ({
  updateBoard: vi.fn(),
}));

vi.mock("@/features/boards/actions/delete-board", () => ({
  deleteBoard: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner-id", email: null });
  mocks.getBoardForEditor.mockResolvedValue({
    id: "30000000-0000-4000-8000-000000000003",
    title: "여름 야시장",
    summary: "행사 요약",
    contentMarkdown: "# 안내",
    template: "event",
    theme: {
      palette: "coral",
      density: "comfortable",
      alignment: "left",
    },
    revision: 2,
    updatedAt: "2026-07-28T10:00:00.000Z",
  });
  mocks.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

it("protects and renders the owner editor", async () => {
  render(
    await EditBoardPage({
      params: Promise.resolve({
        id: "30000000-0000-4000-8000-000000000003",
      }),
    }),
  );

  expect(mocks.requireUser).toHaveBeenCalledWith(
    "/boards/30000000-0000-4000-8000-000000000003/edit",
  );
  expect(screen.getByRole("heading", { name: "안내판 편집" })).toBeVisible();
  expect(screen.getByLabelText("제목")).toHaveValue("여름 야시장");
});

it("uses the same not-found response for missing or foreign boards", async () => {
  mocks.getBoardForEditor.mockResolvedValue(null);

  await expect(
    EditBoardPage({
      params: Promise.resolve({
        id: "30000000-0000-4000-8000-000000000003",
      }),
    }),
  ).rejects.toThrow("NEXT_NOT_FOUND");
});
