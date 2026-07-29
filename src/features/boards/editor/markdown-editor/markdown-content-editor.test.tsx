import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MarkdownContentEditor } from "./markdown-content-editor";
import type {
  CreateMarkdownEditorController,
  MarkdownEditorController,
  ToolbarState,
} from "./types";

const defaultToolbarState: ToolbarState = {
  "heading-2": { active: false, enabled: true },
  "heading-3": { active: false, enabled: true },
  bold: { active: false, enabled: true },
  italic: { active: false, enabled: true },
  link: { active: false, enabled: true },
  "bullet-list": { active: false, enabled: true },
  "ordered-list": { active: false, enabled: true },
  blockquote: { active: false, enabled: true },
  "horizontal-rule": { active: false, enabled: true },
  undo: { active: false, enabled: true },
  redo: { active: false, enabled: true },
};

function createFakeController(
  toolbarState: ToolbarState = defaultToolbarState,
) {
  let markdown = "";
  let onMarkdownChange: (next: string) => void = () => undefined;
  const run = vi.fn(() => true);
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
      focus: vi.fn(),
      destroy: vi.fn(async () => undefined),
    };
  });
  return {
    factory,
    run,
    replaceMarkdown,
    emitMarkdown: (next: string) => onMarkdownChange(next),
  };
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
