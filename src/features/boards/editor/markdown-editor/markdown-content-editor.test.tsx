import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MarkdownContentEditor } from "./markdown-content-editor";
import type {
  CreateMarkdownEditorController,
  MarkdownEditorController,
  ToolbarState,
} from "./types";
import type { BoardImage } from "../../images/model";

const defaultToolbarState: ToolbarState = {
  "heading-2": { active: false, enabled: true },
  "heading-3": { active: false, enabled: true },
  bold: { active: false, enabled: true },
  italic: { active: false, enabled: true },
  link: { active: false, enabled: true },
  image: { active: false, enabled: true },
  "bullet-list": { active: false, enabled: true },
  "ordered-list": { active: false, enabled: true },
  blockquote: { active: false, enabled: true },
  "horizontal-rule": { active: false, enabled: true },
  undo: { active: false, enabled: true },
  redo: { active: false, enabled: true },
};

const image = {
  id: "11111111-1111-4111-8111-111111111111",
  originalFilename: "poster.png",
  mimeType: "image/png" as const,
  sizeBytes: 1_024,
  url: "/b/summer-market/images/11111111-1111-4111-8111-111111111111",
};

const iconToolbarControls = [
  ["제목 2", "heading-2"],
  ["제목 3", "heading-3"],
  ["굵게", "bold"],
  ["기울임", "italic"],
  ["링크", "link"],
  ["글머리 목록", "bullet-list"],
  ["번호 목록", "ordered-list"],
  ["인용", "blockquote"],
  ["구분선", "horizontal-rule"],
  ["실행 취소", "undo"],
  ["다시 실행", "redo"],
] as const;

function createFakeController(
  toolbarState: ToolbarState = defaultToolbarState,
) {
  let markdown = "";
  let onMarkdownChange: (next: string) => void = () => undefined;
  const run = vi.fn(() => true);
  const focus = vi.fn();
  const replaceMarkdown = vi.fn((next: string) => {
    markdown = next;
  });
  const factory: CreateMarkdownEditorController = vi.fn(async (options) => {
    markdown = options.markdown;
    onMarkdownChange = options.onMarkdownChange;
    return {
      getMarkdown: () => markdown,
      replaceMarkdown,
      run,
      getToolbarState: () => toolbarState,
      focus,
      destroy: vi.fn(async () => undefined),
    };
  });
  return {
    factory,
    run,
    focus,
    replaceMarkdown,
    emitMarkdown: (next: string) => onMarkdownChange(next),
  };
}

function renderWithImageInsertion(
  editor: ReturnType<typeof createFakeController>,
  options: {
    maxLength?: number;
    onChange?: (markdown: string) => void;
    value?: string;
  } = {},
) {
  let insertImage: ((nextImage: BoardImage, alt: string) => boolean) | undefined;
  const props = {
    createController: editor.factory,
    id: "board-content",
    imageLibrary: (callback: (nextImage: BoardImage, alt: string) => boolean) => {
      insertImage = callback;
      return <button onClick={() => callback(image, "행사 포스터")} type="button">이미지 삽입</button>;
    },
    maxLength: options.maxLength ?? 200_000,
    onChange: options.onChange ?? vi.fn<(markdown: string) => void>(),
    value: options.value ?? "본문",
  };
  const rendered = render(
    <MarkdownContentEditor {...props} />,
  );
  return { ...rendered, insertImage: () => insertImage };
}

it("switches between rich text and Markdown source without losing edits", async () => {
  const editor = createFakeController();
  const onChange = vi.fn();
  render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      maxLength={200_000}
      onChange={onChange}
      value="## 일정"
    />,
  );

  await screen.findByRole("tab", { name: "리치 텍스트" });
  fireEvent.click(screen.getByRole("tab", { name: "Markdown 원문" }));
  fireEvent.change(screen.getByLabelText("본문 Markdown 원문"), {
    target: { value: "## 프로그램\n\n1. 만들기" },
  });

  expect(onChange).toHaveBeenLastCalledWith("## 프로그램\n\n1. 만들기");
  fireEvent.click(screen.getByRole("tab", { name: "리치 텍스트" }));
  expect(editor.replaceMarkdown).toHaveBeenCalledWith(
    "## 프로그램\n\n1. 만들기",
  );
});

it("bridges a rich image insertion to the controller and restores editor focus", async () => {
  const editor = createFakeController();
  const { insertImage } = renderWithImageInsertion(editor);

  await screen.findByRole("button", { name: "이미지 삽입" });
  await act(async () => {
    expect(insertImage()?.(image, "행사 포스터")).toBe(true);
  });

  expect(editor.run).toHaveBeenCalledWith("image", {
    src: "/b/summer-market/images/11111111-1111-4111-8111-111111111111",
    alt: "행사 포스터",
  });
  expect(editor.focus).toHaveBeenCalled();
});

it("inserts source image Markdown at the textarea selection with necessary newlines", async () => {
  const editor = createFakeController();
  const onChange = vi.fn();
  const { insertImage } = renderWithImageInsertion(editor, {
    onChange,
    value: "첫 줄\n둘째 줄",
  });

  fireEvent.click(await screen.findByRole("tab", { name: "Markdown 원문" }));
  const source = screen.getByLabelText("본문 Markdown 원문") as HTMLTextAreaElement;
  source.setSelectionRange(4, 4);

  await act(async () => {
    expect(insertImage()?.(image, "행사 포스터")).toBe(true);
  });
  expect(source).toHaveValue(
    "첫 줄\n![행사 포스터](/b/summer-market/images/11111111-1111-4111-8111-111111111111)\n둘째 줄",
  );
  expect(onChange).toHaveBeenLastCalledWith(
    "첫 줄\n![행사 포스터](/b/summer-market/images/11111111-1111-4111-8111-111111111111)\n둘째 줄",
  );
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  expect(source.selectionStart).toBe(
    "첫 줄\n![행사 포스터](/b/summer-market/images/11111111-1111-4111-8111-111111111111)".length,
  );
  expect(source.selectionEnd).toBe(source.selectionStart);
});

it("escapes source alt text and permits an explicitly decorative image", async () => {
  const editor = createFakeController();
  const first = renderWithImageInsertion(editor, { value: "" });

  fireEvent.click(await screen.findByRole("tab", { name: "Markdown 원문" }));
  await act(async () => {
    expect(first.insertImage()?.(image, "대괄호 ] 괄호 ( ) 역슬래시 \\")).toBe(true);
  });
  expect(screen.getByLabelText("본문 Markdown 원문")).toHaveValue(
    "![대괄호 \\] 괄호 \\( \\) 역슬래시 \\\\](/b/summer-market/images/11111111-1111-4111-8111-111111111111)",
  );

  first.unmount();
  const editorForDecorativeImage = createFakeController();
  const decorative = renderWithImageInsertion(editorForDecorativeImage, {
    value: "",
  });
  fireEvent.click(await screen.findByRole("tab", { name: "Markdown 원문" }));
  await act(async () => {
    expect(decorative.insertImage()?.(image, "")).toBe(true);
  });
  expect(screen.getByLabelText("본문 Markdown 원문")).toHaveValue(
    "![](/b/summer-market/images/11111111-1111-4111-8111-111111111111)",
  );
});

it("leaves source Markdown unchanged when image insertion is unsafe or exceeds the limit", async () => {
  const editor = createFakeController();
  const onChange = vi.fn();
  const initialMarkdown = "x".repeat(200_000);
  const { insertImage } = renderWithImageInsertion(editor, {
    maxLength: 200_000,
    onChange,
    value: initialMarkdown,
  });
  fireEvent.click(await screen.findByRole("tab", { name: "Markdown 원문" }));

  expect(insertImage()?.(image, "행사 포스터")).toBe(false);
  expect(screen.getByLabelText("본문 Markdown 원문")).toHaveValue(initialMarkdown);
  expect(onChange).not.toHaveBeenCalled();

  const unsafe = { ...image, url: "javascript:alert(1)" };
  expect(insertImage()?.(unsafe, "행사 포스터")).toBe(false);
  expect(screen.getByLabelText("본문 Markdown 원문")).toHaveValue(initialMarkdown);
  expect(onChange).not.toHaveBeenCalled();
});

it("exposes pressed state only for selection-sensitive toolbar commands", async () => {
  const editor = createFakeController({
    ...defaultToolbarState,
    bold: { active: true, enabled: true },
    redo: { active: false, enabled: false },
  });
  render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      maxLength={200_000}
      onChange={vi.fn()}
      value="## 일정"
    />,
  );

  expect(await screen.findByRole("button", { name: "굵게" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "다시 실행" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "구분선" })).not.toHaveAttribute(
    "aria-pressed",
  );
  expect(screen.getByRole("button", { name: "실행 취소" })).not.toHaveAttribute(
    "aria-pressed",
  );
  expect(screen.getByRole("button", { name: "다시 실행" })).not.toHaveAttribute(
    "aria-pressed",
  );
});

it("renders formatting controls as labelled Lucide icon buttons", async () => {
  const editor = createFakeController();
  render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      maxLength={200_000}
      onChange={vi.fn()}
      value="## 일정"
    />,
  );

  const toolbar = screen.getByLabelText("서식 도구");
  await screen.findByRole("button", { name: "굵게" });

  for (const [label] of iconToolbarControls) {
    const button = within(toolbar).getByRole("button", { name: label });
    expect(button).toHaveAttribute("data-tooltip", label);
    expect(button.textContent).toBe("");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  }

  expect(screen.getByRole("tab", { name: "리치 텍스트" })).toHaveTextContent(
    "리치 텍스트",
  );
  expect(screen.getByRole("tab", { name: "Markdown 원문" })).toHaveTextContent(
    "Markdown 원문",
  );
});

it("dispatches the existing command for every non-link icon button", async () => {
  const editor = createFakeController();
  render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      maxLength={200_000}
      onChange={vi.fn()}
      value="본문"
    />,
  );

  await screen.findByRole("button", { name: "굵게" });
  for (const [label, command] of iconToolbarControls) {
    if (command === "link") continue;
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(editor.run).toHaveBeenLastCalledWith(command);
  }
});

it("falls back to source mode when Milkdown initialization fails", async () => {
  const failedFactory = vi.fn(async () => {
    throw new Error("mount failed");
  });
  render(
    <MarkdownContentEditor
      createController={failedFactory}
      id="board-content"
      maxLength={200_000}
      onChange={vi.fn()}
      value="## 보존할 내용"
    />,
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "리치 텍스트 편집기를 열지 못해 Markdown 원문 모드로 전환했습니다.",
  );
  expect(screen.getByLabelText("본문 Markdown 원문")).toHaveValue(
    "## 보존할 내용",
  );
});

it("preserves source content when converting it to rich text fails", async () => {
  const editor = createFakeController();
  editor.replaceMarkdown.mockImplementation(() => {
    throw new Error("parse failed");
  });
  render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      maxLength={200_000}
      onChange={vi.fn()}
      value="## 원문"
    />,
  );

  await screen.findByRole("tab", { name: "리치 텍스트" });
  fireEvent.click(screen.getByRole("tab", { name: "Markdown 원문" }));
  fireEvent.change(screen.getByLabelText("본문 Markdown 원문"), {
    target: { value: "## 그대로 둘 원문" },
  });
  fireEvent.click(screen.getByRole("tab", { name: "리치 텍스트" }));

  expect(screen.getByLabelText("본문 Markdown 원문")).toHaveValue(
    "## 그대로 둘 원문",
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Markdown을 리치 텍스트로 변환하지 못했습니다. 원문은 그대로 보존했습니다.",
  );
});

it("restores the last accepted value when rich text exceeds the character limit", async () => {
  const editor = createFakeController();
  const onChange = vi.fn();
  render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      maxLength={200_000}
      onChange={onChange}
      value="허용된 내용"
    />,
  );

  await screen.findByRole("tab", { name: "리치 텍스트" });
  await waitFor(() => expect(editor.factory).toHaveBeenCalled());
  editor.emitMarkdown("x".repeat(200_001));

  expect(onChange).not.toHaveBeenCalled();
  expect(editor.replaceMarkdown).toHaveBeenCalledWith("허용된 내용");
  expect(await screen.findByRole("alert")).toHaveTextContent("200,000자까지");
});

it("does not send source Markdown beyond the supplied character limit", async () => {
  const editor = createFakeController();
  const onChange = vi.fn();
  render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      maxLength={5}
      onChange={onChange}
      value="허용"
    />,
  );

  fireEvent.click(await screen.findByRole("tab", { name: "Markdown 원문" }));
  const source = screen.getByLabelText("본문 Markdown 원문");
  fireEvent.change(source, { target: { value: "123456" } });

  expect(source).toHaveAttribute("maxlength", "5");
  expect(onChange).not.toHaveBeenCalled();
  expect(source).toHaveValue("허용");
});

it("reconciles an external value received while the controller is initializing", async () => {
  let resolveController: ((controller: MarkdownEditorController) => void) | undefined;
  const controllerReady = new Promise<MarkdownEditorController>((resolve) => {
    resolveController = resolve;
  });
  let markdown = "초기 내용";
  const replaceMarkdown = vi.fn((next: string) => {
    markdown = next;
  });
  const factory: CreateMarkdownEditorController = vi.fn(() => controllerReady);
  const onChange = vi.fn();
  const rendered = render(
    <MarkdownContentEditor
      createController={factory}
      id="board-content"
      maxLength={200_000}
      onChange={onChange}
      value="초기 내용"
    />,
  );

  rendered.rerender(
    <MarkdownContentEditor
      createController={factory}
      id="board-content"
      maxLength={200_000}
      onChange={onChange}
      value="## 복구된 충돌 내용"
    />,
  );

  await act(async () => {
    resolveController?.({
      getMarkdown: () => markdown,
      replaceMarkdown,
      run: vi.fn(() => true),
      getToolbarState: () => defaultToolbarState,
      focus: vi.fn(),
      destroy: vi.fn(async () => undefined),
    });
  });

  expect(replaceMarkdown).toHaveBeenCalledWith("## 복구된 충돌 내용");
  fireEvent.click(screen.getByRole("tab", { name: "Markdown 원문" }));
  expect(screen.getByLabelText("본문 Markdown 원문")).toHaveValue(
    "## 복구된 충돌 내용",
  );
});

it("provides an inline link form and explains rejected URLs", async () => {
  const editor = createFakeController();
  editor.run.mockReturnValue(false);
  render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      maxLength={200_000}
      onChange={vi.fn()}
      value="링크로 만들 문장"
    />,
  );

  fireEvent.click(await screen.findByRole("button", { name: "링크" }));
  fireEvent.change(screen.getByLabelText("URL"), {
    target: { value: "javascript:alert(1)" },
  });
  fireEvent.click(screen.getByRole("button", { name: "적용" }));

  expect(editor.run).toHaveBeenCalledWith("link", {
    href: "javascript:alert(1)",
  });
  expect(screen.getByRole("button", { name: "링크 제거" })).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "안전한 http, https, mailto 또는 내부 링크를 입력해 주세요.",
  );
});

it("submits an internal relative link from the inline form", async () => {
  const editor = createFakeController();
  render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      maxLength={200_000}
      onChange={vi.fn()}
      value="링크로 만들 문장"
    />,
  );

  fireEvent.click(await screen.findByRole("button", { name: "링크" }));
  fireEvent.change(screen.getByLabelText("URL"), {
    target: { value: "/guide" },
  });
  fireEvent.click(screen.getByRole("button", { name: "적용" }));

  expect(editor.run).toHaveBeenCalledWith("link", { href: "/guide" });
});

it("removes an active link from the toolbar without opening the URL form", async () => {
  const editor = createFakeController({
    ...defaultToolbarState,
    link: { active: true, enabled: true },
  });
  render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      maxLength={200_000}
      onChange={vi.fn()}
      value="[안내](/guide)"
    />,
  );

  const linkButton = await screen.findByRole("button", { name: "링크" });
  await waitFor(() => expect(linkButton).toHaveAttribute("aria-pressed", "true"));
  fireEvent.click(linkButton);

  expect(editor.run).toHaveBeenCalledWith("link");
  expect(screen.queryByLabelText("URL")).not.toBeInTheDocument();
});

it("groups formatting controls and renders help as a separate footer", async () => {
  const editor = createFakeController();
  const { container } = render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      maxLength={200_000}
      onChange={vi.fn()}
      value="본문"
    />,
  );

  await screen.findByRole("button", { name: "굵게" });
  expect(container.querySelectorAll(".markdown-toolbar-group")).toHaveLength(5);
  const help = screen.getByText(
    "서식 도구 또는 Markdown 원문으로 본문을 편집할 수 있습니다.",
  );
  expect(help).toHaveClass("markdown-editor-help");
  expect(help.parentElement).toHaveClass("markdown-rich-surface");
  expect(help.previousElementSibling).toHaveClass("markdown-editor-mount");
});
