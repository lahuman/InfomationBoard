import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor, within } from "@testing-library/react";
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

  it.each([
    ["heading-2", "## 선택할 문장"],
    ["heading-3", "### 선택할 문장"],
  ] as const)("toggles %s back to a paragraph", async (command, formatted) => {
    const { controller, root } = await setup("선택할 문장");
    __testing.selectText(controller, 1, 7);

    expect(controller.run(command)).toBe(true);
    expect(controller.getMarkdown()).toBe(formatted);
    expect(controller.getToolbarState()[command].active).toBe(true);

    expect(controller.run(command)).toBe(true);
    expect(controller.getMarkdown()).toBe("선택할 문장");
    expect(root.querySelector("p")).toHaveTextContent("선택할 문장");
    expect(controller.getToolbarState()[command].active).toBe(false);
  });

  it.each([
    ["bold", "**선택할 문장**"],
    ["italic", "*선택할 문장*"],
  ] as const)("toggles %s off without deleting text", async (command, formatted) => {
    const { controller } = await setup("선택할 문장");
    __testing.selectText(controller, 1, 7);

    expect(controller.run(command)).toBe(true);
    expect(controller.getMarkdown()).toBe(formatted);
    expect(controller.run(command)).toBe(true);
    expect(controller.getMarkdown()).toBe("선택할 문장");
  });

  it.each([
    ["bullet-list", "- 선택할 문장", "ul"],
    ["ordered-list", "1. 선택할 문장", "ol"],
    ["blockquote", "> 선택할 문장", "blockquote"],
  ] as const)(
    "toggles %s off without deleting text",
    async (command, formatted, selector) => {
      const { controller, root } = await setup("선택할 문장");
      __testing.selectText(controller, 1, 7);

      expect(controller.run(command)).toBe(true);
      expect(controller.getMarkdown()).toBe(formatted);
      expect(controller.getToolbarState()[command].active).toBe(true);

      expect(controller.run(command)).toBe(true);
      expect(controller.getMarkdown()).toBe("선택할 문장");
      expect(root.querySelector(selector)).not.toBeInTheDocument();
      expect(controller.getToolbarState()[command].active).toBe(false);
    },
  );

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

  it("inserts a safe image at the current selection and publishes one undoable change", async () => {
    const onMarkdownChange = vi.fn();
    const { controller } = await setup("앞 내용\n\n뒤 내용", { onMarkdownChange });
    const imageUrl =
      "/b/summer-market/images/11111111-1111-4111-8111-111111111111";
    __testing.selectText(controller, 3, 3);

    expect(
      controller.run("image", {
        src: imageUrl,
        alt: "행사 포스터",
        width: 100,
      }),
    ).toBe(true);
    expect(controller.getToolbarState().image).toEqual({
      active: false,
      enabled: true,
    });
    expect(controller.getMarkdown()).toContain(
      `![행사 포스터](${imageUrl} "width=100")`,
    );
    await waitFor(() =>
      expect(onMarkdownChange).toHaveBeenLastCalledWith(
        expect.stringContaining(
          `![행사 포스터](${imageUrl} "width=100")`,
        ),
      ),
    );

    expect(controller.run("undo")).toBe(true);
    expect(controller.getMarkdown()).toBe("앞 내용\n\n뒤 내용");
  });

  it("inspects and replaces a selected image in one undoable change", async () => {
    const imageUrl =
      "/b/summer-market/images/11111111-1111-4111-8111-111111111111";
    const { controller } = await setup(
      `![원본](${imageUrl} "width=50")`,
    );
    __testing.selectNode(controller, 1);

    expect(controller.getSelectedImage()).toEqual({
      src: imageUrl,
      alt: "원본",
      width: 50,
    });
    expect(
      controller.run("image", {
        src: imageUrl,
        alt: "수정",
        width: 25,
        replaceSelectedImage: true,
      }),
    ).toBe(true);
    expect(controller.getMarkdown()).toContain(
      `![수정](${imageUrl} "width=25")`,
    );

    expect(controller.run("undo")).toBe(true);
    expect(controller.getMarkdown()).toContain(
      `![원본](${imageUrl} "width=50")`,
    );
  });

  it("returns null and refuses replacement when no image node is selected", async () => {
    const imageUrl =
      "/b/summer-market/images/11111111-1111-4111-8111-111111111111";
    const { controller } = await setup("일반 문단");
    __testing.selectNode(controller, 0);

    expect(controller.getSelectedImage()).toBeNull();
    expect(
      controller.run("image", {
        src: imageUrl,
        alt: "수정",
        width: 50,
        replaceSelectedImage: true,
      }),
    ).toBe(false);
    expect(controller.getMarkdown()).toBe("일반 문단");
  });

  it("rejects an unsupported runtime image width without changing Markdown", async () => {
    const imageUrl =
      "/b/summer-market/images/11111111-1111-4111-8111-111111111111";
    const { controller } = await setup(
      `![원본](${imageUrl} "width=50")`,
    );
    __testing.selectNode(controller, 1);

    expect(
      controller.run("image", {
        src: imageUrl,
        alt: "수정",
        width: 80 as never,
        replaceSelectedImage: true,
      }),
    ).toBe(false);
    expect(controller.getMarkdown()).toContain(
      `![원본](${imageUrl} "width=50")`,
    );
  });

  it("rejects missing and unsafe image sources without changing Markdown", async () => {
    const { controller } = await setup("보존할 내용");
    expect(controller.run("image", { alt: "행사 포스터" })).toBe(false);
    expect(controller.run("image", { src: "javascript:alert(1)", alt: "행사 포스터" })).toBe(
      false,
    );
    expect(controller.getMarkdown()).toBe("보존할 내용");
  });

  it("round-trips Markdown image alt text with escaped delimiters", async () => {
    const imageUrl =
      "/b/summer-market/images/11111111-1111-4111-8111-111111111111";
    const markdown = `![대괄호 \\] 괄호 \\( \\) 역슬래시 \\\\](${imageUrl})`;
    const { controller, root } = await setup(markdown);

    expect(controller.getMarkdown()).toBe(
      `![대괄호 \\] 괄호 ( ) 역슬래시 \\\\](${imageUrl})`,
    );
    expect(root.querySelector("img")).toHaveAttribute(
      "alt",
      "대괄호 ] 괄호 ( ) 역슬래시 \\",
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
