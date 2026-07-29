import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExampleBoardPage, {
  generateMetadata,
  generateStaticParams,
} from "./page";

const mocks = vi.hoisted(() => ({ notFound: vi.fn() }));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

describe("ExampleBoardPage", () => {
  it("renders a known sample", async () => {
    render(
      await ExampleBoardPage({
        params: Promise.resolve({ slug: "summer-festival" }),
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: "한강 여름 음악 축제",
        level: 1,
      }),
    ).toBeVisible();
  });

  it("returns not found for an unknown sample", async () => {
    await expect(
      ExampleBoardPage({
        params: Promise.resolve({ slug: "missing" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("pre-renders all sample slugs", () => {
    expect(generateStaticParams()).toEqual([
      { slug: "cafe-guide" },
      { slug: "summer-festival" },
      { slug: "book-club" },
    ]);
  });

  it("creates non-indexable sample metadata", async () => {
    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: "book-club" }),
      }),
    ).resolves.toEqual({
      title: "퇴근 후 한 장 독서모임 · 활용 예시",
      description:
        "읽은 문장 하나를 가져와 가볍게 이야기하는 저녁 모임입니다.",
      robots: { index: false, follow: false },
    });
  });

  it("keeps missing-sample metadata generic and non-indexable", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "missing" }) }),
    ).resolves.toEqual({
      title: "활용 예시를 찾을 수 없습니다",
      robots: { index: false, follow: false },
    });
  });
});
