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

  it.each([
    [
      "local board image",
      "/b/summer-market/images/30000000-0000-4000-8000-000000000003",
    ],
    ["HTTPS image", "https://images.example.com/poster.png"],
  ])("renders a safe %s lazily with authored alt text", (_label, src) => {
    render(<BoardMarkdown markdown={`![여름 행사 포스터](${src})`} />);

    const image = screen.getByRole("img", {
      name: "여름 행사 포스터",
    });
    expect(image).toHaveAttribute("src", src);
    expect(image).toHaveAttribute("alt", "여름 행사 포스터");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
  });

  it("renders an allowlisted image width without exposing its Markdown title", () => {
    const src = "https://images.example.com/poster.png";

    render(<BoardMarkdown markdown={`![포스터](${src} "width=50")`} />);

    expect(screen.getByRole("img", { name: "포스터" })).toHaveClass(
      "board-image-width-50",
    );
    expect(screen.getByRole("img", { name: "포스터" })).not.toHaveAttribute(
      "title",
    );
  });

  it("uses the default width when an image title is not allowlisted", () => {
    const secondSrc = "https://images.example.com/default.png";

    render(<BoardMarkdown markdown={`![기본](${secondSrc} "width=80")`} />);

    expect(screen.getByRole("img", { name: "기본" })).toHaveClass(
      "board-image-width-100",
    );
  });

  it.each([
    ["JavaScript", "javascript:alert(1)"],
    ["data", "data:image/png;base64,iVBORw0KGgo="],
    ["SVG data", "data:image/svg+xml,<svg onload=alert(1)>"],
    ["email", "mailto:image@example.com"],
    ["malformed local", "/b/summer-market/images/not-a-uuid"],
    [
      "non-v4 local",
      "/b/summer-market/images/30000000-0000-3000-8000-000000000003",
    ],
  ])("does not render an image for a %s source", (_label, src) => {
    const { container } = render(
      <BoardMarkdown markdown={`![차단된 이미지](${src})`} />,
    );

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

  it("distinguishes unordered and ordered lists for marker styling", () => {
    render(<BoardMarkdown markdown={"- 글머리\n\n1. 번호"} />);

    expect(screen.getAllByRole("list")[0]).toHaveClass(
      "board-markdown-list-unordered",
    );
    expect(screen.getAllByRole("list")[1]).toHaveClass(
      "board-markdown-list-ordered",
    );
  });

  it("preserves loose list paragraphs and nested cost lists", () => {
    const { container } = render(
      <BoardMarkdown
        markdown={`1. 얼굴 브로치 만들기

   - 비용 - 15,000 원

2. 종이로 만드는 어린이 집

   - 비용 : 15,000 원

3. 8월 1일 전시 연계 프로그램 진행`}
      />,
    );

    const orderedList = container.querySelector(".board-markdown > ol");

    expect(orderedList?.querySelectorAll(":scope > li")).toHaveLength(3);
    expect(orderedList?.querySelectorAll(":scope > li > p")).toHaveLength(3);
    expect(orderedList?.querySelectorAll(":scope > li > ul")).toHaveLength(2);
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
