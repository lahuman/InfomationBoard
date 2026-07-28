import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBoard,
  type CreateBoardActionState,
} from "./create-board";
import { BOARD_TEMPLATES } from "../templates";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  requireUser: vi.fn(),
  generateBoardSlug: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/features/auth/require-user", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: mocks.from,
  })),
}));

vi.mock("../slug", () => ({
  generateBoardSlug: mocks.generateBoardSlug,
}));

const idle: CreateBoardActionState = { status: "idle" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    id: "10000000-0000-4000-8000-000000000001",
    email: "owner@example.com",
  });
  mocks.generateBoardSlug.mockReturnValue("abc123def456");
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.insert.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ single: mocks.single });
  mocks.single.mockResolvedValue({
    data: { id: "30000000-0000-4000-8000-000000000003" },
    error: null,
  });
});

describe("createBoard", () => {
  it("creates the selected private draft for the authenticated owner", async () => {
    const formData = new FormData();
    formData.set("template", "event");

    await createBoard(idle, formData);

    expect(mocks.requireUser).toHaveBeenCalledWith("/boards/new");
    expect(mocks.from).toHaveBeenCalledWith("boards");
    expect(mocks.insert).toHaveBeenCalledWith({
      owner_id: "10000000-0000-4000-8000-000000000001",
      slug: "abc123def456",
      title: BOARD_TEMPLATES.event.defaults.title,
      summary: BOARD_TEMPLATES.event.defaults.summary,
      content_markdown:
        BOARD_TEMPLATES.event.defaults.contentMarkdown,
      template: "event",
      theme: BOARD_TEMPLATES.event.defaults.theme,
      visibility: "private",
      status: "draft",
    });
    expect(mocks.select).toHaveBeenCalledWith("id");
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/boards/30000000-0000-4000-8000-000000000003/edit",
    );
  });

  it("rejects unsupported templates before authentication or insertion", async () => {
    const formData = new FormData();
    formData.set("template", "custom");
    formData.set("owner_id", "forged-owner");

    await expect(createBoard(idle, formData)).resolves.toEqual({
      status: "error",
      fieldErrors: {
        template: ["안내판 유형을 선택해 주세요."],
      },
    });
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("retries a bounded slug collision", async () => {
    mocks.generateBoardSlug
      .mockReturnValueOnce("collision123")
      .mockReturnValueOnce("unique456789");
    mocks.single
      .mockResolvedValueOnce({
        data: null,
        error: { code: "23505", message: "duplicate details" },
      })
      .mockResolvedValueOnce({
        data: { id: "30000000-0000-4000-8000-000000000003" },
        error: null,
      });
    const formData = new FormData();
    formData.set("template", "store");

    await createBoard(idle, formData);

    expect(mocks.insert).toHaveBeenCalledTimes(2);
    expect(mocks.generateBoardSlug).toHaveBeenCalledTimes(2);
    expect(mocks.redirect).toHaveBeenCalledOnce();
  });

  it("returns a safe error without exposing database details", async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "sensitive database policy details",
      },
    });
    const formData = new FormData();
    formData.set("template", "meeting");

    const result = await createBoard(idle, formData);

    expect(result).toEqual({
      status: "error",
      message: "안내판을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("sensitive");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

