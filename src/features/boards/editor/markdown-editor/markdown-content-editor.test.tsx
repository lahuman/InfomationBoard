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
  ImageEditorBridge,
  MarkdownEditorController,
  SelectedEditorImage,
  ToolbarState,
} from "./types";

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
  initialSelectedImage: SelectedEditorImage | null = null,
) {
  let markdown = "";
  let selectedImage = initialSelectedImage;
  let throwOnNextGetMarkdown = false;
  let onMarkdownChange: (next: string) => void = () => undefined;
  const run = vi.fn((command, payload) => {
    if (command === "image" && payload?.src) {
      markdown = `${markdown}\n![${payload.alt ?? ""}](${payload.src})`;
      onMarkdownChange(markdown);
    }
    return true;
  });
  const focus = vi.fn();
  const replaceMarkdown = vi.fn((next: string) => {
    markdown = next;
  });
  const getMarkdown = vi.fn(() => {
    if (throwOnNextGetMarkdown) {
      throwOnNextGetMarkdown = false;
      throw new Error("serialize failed");
    }
    return markdown;
  });
  const factory: CreateMarkdownEditorController = vi.fn(async (options) => {
    markdown = options.markdown;
    onMarkdownChange = options.onMarkdownChange;
    return {
      getMarkdown,
      getSelectedImage: () => selectedImage,
      replaceMarkdown,
      run,
      getToolbarState: () => toolbarState,
      focus,
      destroy: vi.fn(async () => undefined),
    };
  });
  return {
    factory,
    getMarkdown,
    run,
    focus,
    replaceMarkdown,
    emitMarkdown: (next: string) => onMarkdownChange(next),
    setSelectedImage: (next: SelectedEditorImage | null) => {
      selectedImage = next;
    },
    makeNextRunProduce: (next: string) => {
      run.mockImplementationOnce(() => {
        markdown = next;
        onMarkdownChange(markdown);
        return true;
      });
    },
    makeNextGetMarkdownThrow: () => {
      throwOnNextGetMarkdown = true;
    },
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
  let bridge: ImageEditorBridge | undefined;
  const props = {
    createController: editor.factory,
    id: "board-content",
    imageLibrary: (nextBridge: ImageEditorBridge) => {
      bridge = nextBridge;
      return (
        <button
          onClick={() =>
            nextBridge.applyImage({
              image,
              alt: "행사 포스터",
              width: 50,
            })
          }
          type="button"
        >
          이미지 적용
        </button>
      );
    },
    maxLength: options.maxLength ?? 200_000,
    onChange: options.onChange ?? vi.fn<(markdown: string) => void>(),
    value: options.value ?? "본문",
  };
  const rendered = render(
    <MarkdownContentEditor {...props} />,
  );
  return { ...rendered, bridge: () => bridge };
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

it("opens the image bridge with the rich image selected at toolbar activation", async () => {
  const selectedImage = {
    src: image.url,
    alt: "기존 포스터",
    width: 25 as const,
  };
  const editor = createFakeController(defaultToolbarState, selectedImage);
  const { bridge } = renderWithImageInsertion(editor);

  const imageButton = await screen.findByRole("button", { name: "이미지" });
  expect(bridge()).toMatchObject({ open: false, selectedImage: null });

  fireEvent.click(imageButton);
  editor.setSelectedImage(null);

  expect(bridge()).toMatchObject({ open: true, selectedImage });
});

it("updates the captured rich image only when the chosen URL matches", async () => {
  const editor = createFakeController(defaultToolbarState, {
    src: image.url,
    alt: "기존 포스터",
    width: 25,
  });
  editor.makeNextRunProduce(
    `![새 포스터](${image.url} "width=75")`,
  );
  const onChange = vi.fn();
  const { bridge } = renderWithImageInsertion(editor, { onChange });

  fireEvent.click(await screen.findByRole("button", { name: "이미지" }));
  await act(async () => {
    expect(
      bridge()?.applyImage({ image, alt: "새 포스터", width: 75 }),
    ).toBe(true);
  });

  expect(editor.run).toHaveBeenCalledWith("image", {
    src: image.url,
    alt: "새 포스터",
    width: 75,
    replaceSelectedImage: true,
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(
    `![새 포스터](${image.url} "width=75")`,
  );
  expect(bridge()?.open).toBe(false);
  expect(editor.focus).toHaveBeenCalledTimes(1);
});

it("inserts a different library image instead of replacing the captured rich image", async () => {
  const otherImage = {
    ...image,
    id: "22222222-2222-4222-8222-222222222222",
    url: "/b/summer-market/images/22222222-2222-4222-8222-222222222222",
  };
  const editor = createFakeController(defaultToolbarState, {
    src: image.url,
    alt: "기존 포스터",
    width: 25,
  });
  editor.makeNextRunProduce(
    `본문\n![다른 이미지](${otherImage.url} "width=50")`,
  );
  const { bridge } = renderWithImageInsertion(editor);

  fireEvent.click(await screen.findByRole("button", { name: "이미지" }));
  await act(async () => {
    expect(
      bridge()?.applyImage({ image: otherImage, alt: "다른 이미지", width: 50 }),
    ).toBe(true);
  });

  expect(editor.run).toHaveBeenCalledWith("image", {
    src: otherImage.url,
    alt: "다른 이미지",
    width: 50,
    replaceSelectedImage: false,
  });
});

it("replaces a captured source image without adding newlines", async () => {
  const initialMarkdown = `앞 ![기존](${image.url} "width=25") 뒤`;
  const editor = createFakeController();
  const onChange = vi.fn();
  const { bridge } = renderWithImageInsertion(editor, {
    onChange,
    value: initialMarkdown,
  });

  fireEvent.click(await screen.findByRole("tab", { name: "Markdown 원문" }));
  const source = screen.getByLabelText("본문 Markdown 원문") as HTMLTextAreaElement;
  const caret = initialMarkdown.indexOf("기존") + 1;
  source.setSelectionRange(caret, caret);
  fireEvent.click(screen.getByRole("button", { name: "이미지" }));

  expect(bridge()?.selectedImage).toEqual({
    src: image.url,
    alt: "기존",
    width: 25,
  });
  await act(async () => {
    expect(
      bridge()?.applyImage({ image, alt: "교체", width: 75 }),
    ).toBe(true);
  });

  expect(source).toHaveValue(
    `앞 ![교체](${image.url} "width=75") 뒤`,
  );
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(bridge()?.open).toBe(false);
});

it("inserts a width-aware source image at an unselected caret with necessary newlines", async () => {
  const editor = createFakeController();
  const onChange = vi.fn();
  const { bridge } = renderWithImageInsertion(editor, {
    onChange,
    value: "첫 줄\n둘째 줄",
  });

  fireEvent.click(await screen.findByRole("tab", { name: "Markdown 원문" }));
  const source = screen.getByLabelText("본문 Markdown 원문") as HTMLTextAreaElement;
  source.setSelectionRange(4, 4);
  fireEvent.click(screen.getByRole("button", { name: "이미지" }));

  await act(async () => {
    expect(
      bridge()?.applyImage({ image, alt: "행사 포스터", width: 50 }),
    ).toBe(true);
  });
  expect(source).toHaveValue(
    '첫 줄\n![행사 포스터](/b/summer-market/images/11111111-1111-4111-8111-111111111111 "width=50")\n둘째 줄',
  );
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(
    '첫 줄\n![행사 포스터](/b/summer-market/images/11111111-1111-4111-8111-111111111111 "width=50")\n둘째 줄',
  );
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  expect(source.selectionStart).toBe(
    '첫 줄\n![행사 포스터](/b/summer-market/images/11111111-1111-4111-8111-111111111111 "width=50")'.length,
  );
  expect(source.selectionEnd).toBe(source.selectionStart);
});

it("escapes source alt text and permits an explicitly decorative image", async () => {
  const editor = createFakeController();
  const first = renderWithImageInsertion(editor, { value: "" });

  fireEvent.click(await screen.findByRole("tab", { name: "Markdown 원문" }));
  fireEvent.click(screen.getByRole("button", { name: "이미지" }));
  await act(async () => {
    expect(
      first.bridge()?.applyImage({
        image,
        alt: "대괄호 ] 괄호 ( ) 역슬래시 \\",
        width: 100,
      }),
    ).toBe(true);
  });
  expect(screen.getByLabelText("본문 Markdown 원문")).toHaveValue(
    '![대괄호 \\] 괄호 \\( \\) 역슬래시 \\\\](/b/summer-market/images/11111111-1111-4111-8111-111111111111 "width=100")',
  );

  first.unmount();
  const editorForDecorativeImage = createFakeController();
  const decorative = renderWithImageInsertion(editorForDecorativeImage, {
    value: "",
  });
  fireEvent.click(await screen.findByRole("tab", { name: "Markdown 원문" }));
  fireEvent.click(screen.getByRole("button", { name: "이미지" }));
  await act(async () => {
    expect(
      decorative.bridge()?.applyImage({ image, alt: "", width: 25 }),
    ).toBe(true);
  });
  expect(screen.getByLabelText("본문 Markdown 원문")).toHaveValue(
    '![](/b/summer-market/images/11111111-1111-4111-8111-111111111111 "width=25")',
  );
});

it("keeps the image bridge open when the rich controller rejects the mutation", async () => {
  const editor = createFakeController();
  editor.run.mockReturnValueOnce(false);
  const onChange = vi.fn();
  const { bridge } = renderWithImageInsertion(editor, { onChange });

  fireEvent.click(await screen.findByRole("button", { name: "이미지" }));
  expect(
    bridge()?.applyImage({ image, alt: "행사 포스터", width: 50 }),
  ).toBe(false);

  expect(bridge()?.open).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
});

it("keeps the image bridge open when a rich mutation is unchanged", async () => {
  const editor = createFakeController();
  editor.makeNextRunProduce("본문");
  const onChange = vi.fn();
  const { bridge } = renderWithImageInsertion(editor, { onChange });

  fireEvent.click(await screen.findByRole("button", { name: "이미지" }));
  expect(
    bridge()?.applyImage({ image, alt: "행사 포스터", width: 50 }),
  ).toBe(false);

  expect(bridge()?.open).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
});

it("rolls back a rich image when reading the post-mutation Markdown fails", async () => {
  const editor = createFakeController();
  const onChange = vi.fn();
  const { bridge } = renderWithImageInsertion(editor, {
    onChange,
    value: "본문",
  });

  await waitFor(() => expect(editor.getMarkdown).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "이미지" }));
  editor.makeNextRunProduce(
    `본문\n![행사 포스터](${image.url} "width=50")`,
  );
  editor.makeNextGetMarkdownThrow();

  await act(async () => {
    expect(
      bridge()?.applyImage({ image, alt: "행사 포스터", width: 50 }),
    ).toBe(false);
  });

  expect(editor.replaceMarkdown).toHaveBeenCalledWith("본문");
  expect(onChange).not.toHaveBeenCalled();
  expect(bridge()?.open).toBe(true);
  fireEvent.click(screen.getByRole("tab", { name: "Markdown 원문" }));
  expect(screen.getByLabelText("본문 Markdown 원문")).toHaveValue("본문");
  fireEvent.click(screen.getByRole("tab", { name: "리치 텍스트" }));
  editor.emitMarkdown("후속 일반 입력");
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith("후속 일반 입력");
});

it("falls back to source mode when post-mutation serialization and rollback both fail", async () => {
  const editor = createFakeController();
  const onChange = vi.fn();
  const { bridge } = renderWithImageInsertion(editor, {
    onChange,
    value: "본문",
  });

  await waitFor(() => expect(editor.getMarkdown).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "이미지" }));
  editor.makeNextRunProduce(
    `본문\n![행사 포스터](${image.url} "width=50")`,
  );
  editor.makeNextGetMarkdownThrow();
  editor.replaceMarkdown.mockImplementationOnce(() => {
    throw new Error("rollback failed");
  });

  await act(async () => {
    expect(
      bridge()?.applyImage({ image, alt: "행사 포스터", width: 50 }),
    ).toBe(false);
  });

  expect(screen.getByRole("tab", { name: "Markdown 원문" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Markdown을 리치 텍스트로 변환하지 못했습니다.",
  );
  expect(screen.getByLabelText("본문 Markdown 원문")).toHaveValue("본문");
  expect(onChange).not.toHaveBeenCalled();
  expect(bridge()?.open).toBe(true);
});

it("keeps source Markdown and the bridge open for an unsafe image URL", async () => {
  const editor = createFakeController();
  const onChange = vi.fn();
  const { bridge } = renderWithImageInsertion(editor, {
    onChange,
    value: "본문",
  });
  fireEvent.click(await screen.findByRole("tab", { name: "Markdown 원문" }));
  fireEvent.click(screen.getByRole("button", { name: "이미지" }));

  const unsafe = { ...image, url: "javascript:alert(1)" };
  expect(
    bridge()?.applyImage({ image: unsafe, alt: "행사 포스터", width: 50 }),
  ).toBe(false);

  expect(screen.getByLabelText("본문 Markdown 원문")).toHaveValue("본문");
  expect(bridge()?.open).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
});

it("rolls back synchronously and keeps the bridge open when a rich image exceeds the limit", async () => {
  const editor = createFakeController();
  const onChange = vi.fn();
  const initialMarkdown = "x".repeat(200_000);
  editor.makeNextRunProduce(
    `${initialMarkdown}\n![행사 포스터](${image.url} "width=50")`,
  );
  const { bridge } = renderWithImageInsertion(editor, {
    maxLength: 200_000,
    onChange,
    value: initialMarkdown,
  });

  fireEvent.click(await screen.findByRole("button", { name: "이미지" }));
  await act(async () => {
    expect(
      bridge()?.applyImage({ image, alt: "행사 포스터", width: 50 }),
    ).toBe(false);
  });

  expect(editor.replaceMarkdown).toHaveBeenCalledWith(initialMarkdown);
  expect(bridge()?.open).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("200,000자까지");
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
      getSelectedImage: () => null,
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

it.each(["리치 텍스트", "Markdown 원문"])(
  "opens the image library from an icon toolbar in %s mode and closes it with Escape",
  async (mode) => {
    const editor = createFakeController();
    render(
      <MarkdownContentEditor
        createController={editor.factory}
        id="board-content"
        imageLibrary={() => <div>라이브러리 패널</div>}
        maxLength={200_000}
        onChange={vi.fn()}
        value="본문"
      />,
    );

    if (mode === "Markdown 원문") {
      fireEvent.click(await screen.findByRole("tab", { name: mode }));
    }
    const imageButton = await screen.findByRole("button", { name: "이미지" });
    expect(imageButton).toHaveAttribute("data-tooltip", "이미지");
    expect(imageButton).toHaveClass("markdown-image-toggle");
    expect(imageButton).toHaveAttribute("aria-expanded", "false");
    expect(imageButton.textContent).toBe("");
    expect(imageButton.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("라이브러리 패널")).not.toBeVisible();

    fireEvent.click(imageButton);
    expect(imageButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("라이브러리 패널")).toBeVisible();

    fireEvent.keyDown(screen.getByLabelText("본문 편집기"), { key: "Escape" });
    expect(imageButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("라이브러리 패널")).not.toBeVisible();
  },
);

it("preserves mounted image library state while the panel is closed", async () => {
  const editor = createFakeController();
  render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      imageLibrary={() => (
        <input aria-label="라이브러리 로컬 상태" defaultValue="초기" />
      )}
      maxLength={200_000}
      onChange={vi.fn()}
      value="본문"
    />,
  );

  const imageButton = await screen.findByRole("button", { name: "이미지" });
  fireEvent.click(imageButton);
  fireEvent.change(screen.getByLabelText("라이브러리 로컬 상태"), {
    target: { value: "변경" },
  });
  fireEvent.click(imageButton);
  fireEvent.click(imageButton);

  expect(screen.getByLabelText("라이브러리 로컬 상태")).toHaveValue("변경");
});

it("returns focus to the image toggle when Escape closes from a panel control", async () => {
  const editor = createFakeController();
  render(
    <MarkdownContentEditor
      createController={editor.factory}
      id="board-content"
      imageLibrary={() => <button type="button">패널 작업</button>}
      maxLength={200_000}
      onChange={vi.fn()}
      value="본문"
    />,
  );

  const imageButton = await screen.findByRole("button", { name: "이미지" });
  fireEvent.click(imageButton);
  const panelControl = screen.getByRole("button", { name: "패널 작업" });
  panelControl.focus();
  expect(panelControl).toHaveFocus();

  fireEvent.keyDown(panelControl, { key: "Escape" });

  expect(screen.getByText("패널 작업")).not.toBeVisible();
  expect(imageButton).toHaveAttribute("aria-expanded", "false");
  expect(imageButton).toHaveFocus();
});

it("returns focus to the image toggle when the image bridge closes itself", async () => {
  const editor = createFakeController();
  const { bridge } = renderWithImageInsertion(editor);

  const imageButton = await screen.findByRole("button", { name: "이미지" });
  fireEvent.click(imageButton);
  screen.getByRole("button", { name: "이미지 적용" }).focus();

  act(() => bridge()?.close());

  expect(bridge()?.open).toBe(false);
  expect(imageButton).toHaveFocus();
});
