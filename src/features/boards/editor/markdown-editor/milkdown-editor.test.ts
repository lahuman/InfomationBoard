import { afterEach, describe, expect, it, vi } from "vitest";
import { within } from "@testing-library/react";
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

  it("gives the rich textbox its supplied accessible name and help text", async () => {
    const label = document.createElement("span");
    label.id = "board-content-label";
    label.textContent = "본문";
    const help = document.createElement("p");
    help.id = "board-content-rich-help";
    help.textContent = "서식 도구 또는 Markdown 원문으로 본문을 편집할 수 있습니다.";
    document.body.append(label, help);

    const { root } = await setup("본문", {
      ariaLabelledBy: label.id,
      ariaDescribedBy: help.id,
    });

    const textbox = within(root).getByRole("textbox", { name: "본문" });
    expect(textbox).toHaveAccessibleName("본문");
    expect(textbox).toHaveAccessibleDescription(help.textContent);
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

  it.each([
    ["heading-3", "h3"],
    ["italic", "em"],
    ["bullet-list", "ul"],
    ["ordered-list", "ol"],
    ["blockquote", "blockquote"],
  ] as const)("maps %s to the expected Milkdown command", async (command, selector) => {
    const { controller, root } = await setup("선택할 문장");
    __testing.selectText(controller, 1, 7);

    expect(controller.run(command)).toBe(true);
    expect(root.querySelector(selector)).toHaveTextContent("선택할 문장");
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

  it("removes a link when the link command has no URL payload", async () => {
    const { controller, root } = await setup("원주 책방 틈");
    __testing.selectText(controller, 1, 8);
    expect(controller.run("link", { href: "/guide" })).toBe(true);
    expect(root.querySelector("a")).toHaveTextContent("원주 책방 틈");

    expect(controller.run("link")).toBe(true);
    expect(root.querySelector("a")).not.toBeInTheDocument();
    expect(controller.getMarkdown()).not.toContain("/guide");
  });

  it("does not re-emit an externally replaced Markdown value", async () => {
    const onMarkdownChange = vi.fn();
    const { controller } = await setup("처음", { onMarkdownChange });
    controller.replaceMarkdown("## 서버 복구본");

    expect(controller.getMarkdown()).toBe("## 서버 복구본");
    expect(onMarkdownChange).not.toHaveBeenCalled();
  });

  it("ignores an externally supplied terminal-newline variant", async () => {
    const onMarkdownChange = vi.fn();
    const onToolbarStateChange = vi.fn();
    const { controller } = await setup("**처음**", {
      onMarkdownChange,
      onToolbarStateChange,
    });
    __testing.selectText(controller, 1, 3);
    const toolbarCallCount = onToolbarStateChange.mock.calls.length;

    controller.replaceMarkdown("**처음**\n");

    expect(onMarkdownChange).not.toHaveBeenCalled();
    expect(onToolbarStateChange).toHaveBeenCalledTimes(toolbarCallCount);
    expect(controller.getToolbarState().bold.active).toBe(true);
    expect(controller.run("bold")).toBe(true);
    expect(controller.getMarkdown()).toBe("처음");
  });

  it("publishes toolbar changes without duplicating an unchanged selection", async () => {
    const onToolbarStateChange = vi.fn();
    const { controller } = await setup("**강조** 보통", {
      onToolbarStateChange,
    });

    __testing.selectText(controller, 4, 6);
    expect(controller.getToolbarState().bold).toEqual({
      active: false,
      enabled: true,
    });

    __testing.selectText(controller, 1, 3);
    expect(controller.getToolbarState().bold).toEqual({
      active: true,
      enabled: true,
    });

    expect(controller.run("bold")).toBe(true);
    expect(controller.getToolbarState().bold).toEqual({
      active: false,
      enabled: true,
    });
    expect(controller.getToolbarState().undo.enabled).toBe(true);

    const toolbarCallCount = onToolbarStateChange.mock.calls.length;
    __testing.selectText(controller, 1, 3);
    __testing.selectText(controller, 1, 3);
    expect(onToolbarStateChange).toHaveBeenCalledTimes(toolbarCallCount);
  });

  it("round-trips GFM tables and strikethrough", async () => {
    const markdown =
      "~~마감~~\n\n| 시간 | 내용 |\n| --- | --- |\n| 14:00 | 시작 |";
    const { controller } = await setup(markdown);
    expect(controller.getMarkdown()).toContain("~~마감~~");
    expect(controller.getMarkdown()).toContain("| 시간 | 내용 |");
  });
});
