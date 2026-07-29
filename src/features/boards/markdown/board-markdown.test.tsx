import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BoardMarkdown } from "./board-markdown";

describe("BoardMarkdown", () => {
  it("renders supported Markdown and GitHub-flavored tables", () => {
    render(
      <BoardMarkdown
        markdown={`# 행사 안내

~~마감~~ **접수 중**

| 시간 | 내용 |
| --- | --- |
| 14:00 | 시작 |`}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "행사 안내" }),
    ).toBeInTheDocument();
    expect(screen.getByText("마감").tagName).toBe("DEL");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("does not create elements from raw HTML", () => {
    const { container } = render(
      <BoardMarkdown
        markdown={`안전한 본문

<script>window.pwned = true</script>
<img src=x onerror="window.pwned = true">`}
      />,
    );

    expect(screen.getByText("안전한 본문")).toBeInTheDocument();
    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("drops unsafe links instead of rendering clickable anchors", () => {
    const { container } = render(
      <BoardMarkdown markdown="[실행하지 않음](javascript:alert(1))" />,
    );

    expect(screen.getByText("실행하지 않음")).toBeInTheDocument();
    expect(container.querySelector("a")).not.toBeInTheDocument();
  });

  it("isolates external links and preserves relative links", () => {
    render(
      <BoardMarkdown
        markdown={`[외부 안내](https://example.com/guide)

[내부 안내](/guide)`}
      />,
    );

    expect(screen.getByRole("link", { name: "외부 안내" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: "외부 안내" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.getByRole("link", { name: "내부 안내" })).not.toHaveAttribute(
      "target",
    );
  });

  it("renders the sample hierarchy, list types, and authored horizontal rule", () => {
    const { container } = render(
      <BoardMarkdown markdown={`## 일정

- **날짜:** 2026년 7월 6일 ~ 8월 1일

## 프로그램

1. 얼글 브로치 만들기

---

[원주 책방 틈](https://www.instagram.com/chaegbang_teum/)`} />,
    );

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(2);
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(container.querySelectorAll("hr")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "원주 책방 틈" })).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  it("adds a decorative indicator only to external links", () => {
    const { container } = render(
      <BoardMarkdown
        markdown="[외부](https://example.com) [내부](/guide) [메일](mailto:hello@example.com)"
      />,
    );
    const external = screen.getByRole("link", { name: "외부" });
    expect(external.querySelector('[aria-hidden="true"]')).toHaveTextContent("↗");
    expect(screen.getByRole("link", { name: "내부" })).not.toHaveTextContent("↗");
    expect(screen.getByRole("link", { name: "메일" })).not.toHaveTextContent("↗");
    expect(container.querySelectorAll("hr")).toHaveLength(0);
  });
});
