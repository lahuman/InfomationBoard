import { afterEach, describe, expect, it, vi } from "vitest";
import { createMilkdownEditorController } from "./milkdown-editor";

const sample = `## 일정

- **날짜:** 2026년 7월 6일 ~ 8월 1일
- **작가 정보:** 인형작가 남정희

## 장소

[원주 책방 틈](https://www.instagram.com/chaegbang_teum/)

## 프로그램

1. 얼글 브로치 만들기
2. 종이로 만드는 어린이 집`;

describe("createMilkdownEditorController", () => {
  const controllers: Array<{ destroy(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(controllers.splice(0).map((item) => item.destroy()));
  });

  it("loads and serializes the existing board Markdown", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const onMarkdownChange = vi.fn();
    const controller = await createMilkdownEditorController({
      root,
      markdown: sample,
      onMarkdownChange,
      onToolbarStateChange: vi.fn(),
    });
    controllers.push(controller);

    expect(controller.getMarkdown()).toContain("## 일정");
    expect(controller.getMarkdown()).toContain("- **날짜:**");
    expect(controller.getMarkdown()).toContain("1. 얼글 브로치 만들기");
    expect(root.querySelector("h2")).toHaveTextContent("일정");
    expect(root.querySelector("ol")).toBeInTheDocument();
    expect(onMarkdownChange).not.toHaveBeenCalled();
  });

  it("preserves fenced code that starts with a literal asterisk", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const controller = await createMilkdownEditorController({
      root,
      markdown: "```text\n* example\n```",
      onMarkdownChange: vi.fn(),
      onToolbarStateChange: vi.fn(),
    });
    controllers.push(controller);

    expect(controller.getMarkdown()).toContain("```text\n* example\n```");
  });

  it("preserves GFM tables and strikethrough", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const controller = await createMilkdownEditorController({
      root,
      markdown: "| 상태 | 내용 |\n| --- | --- |\n| 완료 | ~~취소됨~~ |",
      onMarkdownChange: vi.fn(),
      onToolbarStateChange: vi.fn(),
    });
    controllers.push(controller);

    expect(controller.getMarkdown()).toContain("~~취소됨~~");
    expect(root.querySelector("table")).toBeInTheDocument();
    expect(root.querySelector("del")).toHaveTextContent("취소됨");
  });

  it("preserves raw HTML source as inert editor text", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const rawHtml =
      '<script>globalThis.milkdownXss = true</script><img src=x onerror="globalThis.milkdownXss = true"><board-widget>안전</board-widget>';
    const controller = await createMilkdownEditorController({
      root,
      markdown: rawHtml,
      onMarkdownChange: vi.fn(),
      onToolbarStateChange: vi.fn(),
    });
    controllers.push(controller);

    expect(controller.getMarkdown()).toContain(rawHtml);
    expect(root.querySelector("script")).not.toBeInTheDocument();
    expect(root.querySelector('img[src="x"]')).not.toBeInTheDocument();
    expect(root.querySelector("board-widget")).not.toBeInTheDocument();
    expect(globalThis).not.toHaveProperty("milkdownXss");
  });
});
