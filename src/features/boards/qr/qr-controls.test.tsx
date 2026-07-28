import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QrControls } from "./qr-controls";

const writeText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

describe("QrControls", () => {
  it("previews, copies, and downloads the canonical board QR", async () => {
    const canonicalUrl = "https://boards.example/b/summer-night-market";
    render(<QrControls canonicalUrl={canonicalUrl} enabled />);

    expect(screen.getByRole("img", { name: "안내판 QR 미리보기" })).toHaveAttribute(
      "src",
      "/b/summer-night-market/qr.svg?preview=1",
    );
    expect(screen.getByRole("link", { name: "PNG 다운로드" })).toHaveAttribute(
      "href",
      "/b/summer-night-market/qr.png",
    );
    expect(screen.getByRole("link", { name: "SVG 다운로드" })).toHaveAttribute(
      "href",
      "/b/summer-night-market/qr.svg",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "링크 복사" }));
    });
    expect(writeText).toHaveBeenCalledWith(canonicalUrl);
    expect(screen.getByRole("status")).toHaveTextContent("링크를 복사했습니다.");
  });

  it("does not expose QR downloads for a private draft", () => {
    render(
      <QrControls
        canonicalUrl="https://boards.example/b/private-board"
        enabled={false}
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /다운로드/ })).not.toBeInTheDocument();
    expect(screen.getByText(/게시한 뒤 QR을 사용할 수 있습니다/)).toBeVisible();
  });
});
