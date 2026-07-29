import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __testing,
  createMilkdownEditorController,
} from "./milkdown-editor";

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

  async function setup(
    markdown: string,
    options: Partial<Parameters<typeof createMilkdownEditorController>[0]> = {},
  ) {
    const root = document.createElement("div");
    document.body.append(root);
    const controller = await createMilkdownEditorController({
      root,
      markdown,
      onMarkdownChange: vi.fn(),
      onToolbarStateChange: vi.fn(),
      ...options,
    });
    controllers.push(controller);
    return { controller, root };
  }

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

    const markdown = controller.getMarkdown();

    expect(markdown).toMatch(/^\| 상태\s+\| 내용\s+\|$/m);
    expect(markdown).toMatch(/^\| -+\s+\| -+\s+\|$/m);
    expect(markdown).toMatch(/^\| 완료\s+\| ~~취소됨~~\s+\|$/m);
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

  it("runs the agreed heading, emphasis, list, rule, undo, and redo commands", async () => {
    const { controller, root } = await setup("선택할 문장");
    __testing.selectText(controller, 1, 7);

    expect(controller.run("bold")).toBe(true);
    expect(controller.getMarkdown()).toContain("**선택할 문장**");
    expect(controller.run("undo")).toBe(true);
    expect(controller.getMarkdown()).toBe("선택할 문장");
    expect(controller.run("redo")).toBe(true);
    expect(root.querySelector("strong")).toBeInTheDocument();

    controller.run("heading-2");
    expect(root.querySelector("h2")).toBeInTheDocument();
    expect(root.querySelector("h2")).toHaveTextContent("선택할 문장");
    controller.run("horizontal-rule");
    expect(controller.getMarkdown()).toContain("---");
  });

  it("rejects unsafe links and accepts safe links", async () => {
    const { controller } = await setup("원주 책방 틈");
    __testing.selectText(controller, 1, 8);

    expect(controller.run("link", { href: "javascript:alert(1)" })).toBe(
      false,
    );
    expect(controller.getMarkdown()).not.toContain("javascript:");
    expect(controller.run("link", { href: "https://example.com" })).toBe(
      true,
    );
    expect(controller.getMarkdown()).toContain(
      "[원주 책방 틈](https://example.com)",
    );
  });

  it("does not re-emit an externally replaced Markdown value", async () => {
    const onMarkdownChange = vi.fn();
    const { controller } = await setup("처음", { onMarkdownChange });
    controller.replaceMarkdown("## 서버 복구본");

    expect(controller.getMarkdown()).toBe("## 서버 복구본");
    expect(onMarkdownChange).not.toHaveBeenCalled();
  });

  it("round-trips GFM tables and strikethrough", async () => {
    const markdown =
      "~~마감~~\n\n| 시간 | 내용 |\n| --- | --- |\n| 14:00 | 시작 |";
    const { controller } = await setup(markdown);
    expect(controller.getMarkdown()).toContain("~~마감~~");
    expect(controller.getMarkdown()).toContain("| 시간 | 내용 |");
  });
});
