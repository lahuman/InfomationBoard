"use client";

import {
  Bold,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { serializeImageWidthTitle } from "../../images/presentation";
import { sanitizeBoardImageUrl } from "../../markdown/url";
import { createMilkdownEditorController } from "./milkdown-editor";
import {
  escapeMarkdownAlt,
  findSourceImageAtSelection,
  replaceSourceImage,
  type SourceImageSelection,
} from "./source-image";
import type {
  CreateMarkdownEditorController,
  ImageEditorBridge,
  MarkdownEditorCommand,
  MarkdownEditorController,
  SelectedEditorImage,
  ToolbarState,
} from "./types";

type MarkdownContentEditorProps = {
  id: string;
  maxLength: number;
  value: string;
  onChange(markdown: string): void;
  createController?: CreateMarkdownEditorController;
  imageLibrary?: (bridge: ImageEditorBridge) => ReactNode;
};

type EditorMode = "rich" | "source";

const toolbarGroups = [
  [
    "text",
    [
      ["heading-2", "제목 2", Heading2],
      ["heading-3", "제목 3", Heading3],
      ["bold", "굵게", Bold],
      ["italic", "기울임", Italic],
    ],
  ],
  ["link", [["link", "링크", Link]]],
  [
    "blocks",
    [
      ["bullet-list", "글머리 목록", List],
      ["ordered-list", "번호 목록", ListOrdered],
      ["blockquote", "인용", Quote],
    ],
  ],
  ["insert", [["horizontal-rule", "구분선", Minus]]],
  [
    "history",
    [
      ["undo", "실행 취소", Undo2],
      ["redo", "다시 실행", Redo2],
    ],
  ],
] as const satisfies ReadonlyArray<
  readonly [
    string,
    ReadonlyArray<readonly [MarkdownEditorCommand, string, LucideIcon]>,
  ]
>;

const selectionSensitiveToolbarCommands = new Set<MarkdownEditorCommand>([
  "heading-2",
  "heading-3",
  "bold",
  "italic",
  "link",
  "bullet-list",
  "ordered-list",
  "blockquote",
]);

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

const initializationError =
  "리치 텍스트 편집기를 열지 못해 Markdown 원문 모드로 전환했습니다.";
const conversionError =
  "Markdown을 리치 텍스트로 변환하지 못했습니다. 원문은 그대로 보존했습니다.";
const linkError = "안전한 http, https, mailto 또는 내부 링크를 입력해 주세요.";

function characterLimitError(maxLength: number) {
  return `본문은 ${maxLength.toLocaleString("ko-KR")}자까지 입력할 수 있습니다.`;
}

export function MarkdownContentEditor({
  id,
  maxLength,
  value,
  onChange,
  createController = createMilkdownEditorController,
  imageLibrary,
}: MarkdownContentEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const imageToggleRef = useRef<HTMLButtonElement>(null);
  const controllerRef = useRef<MarkdownEditorController | null>(null);
  const latestValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const maxLengthRef = useRef(maxLength);
  const [mode, setMode] = useState<EditorMode>("rich");
  const [sourceValue, setSourceValue] = useState(value);
  const [toolbarState, setToolbarState] = useState(defaultToolbarState);
  const [error, setError] = useState("");
  const [linkFormVisible, setLinkFormVisible] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] =
    useState<SelectedEditorImage | null>(null);
  const imageContextRef = useRef<{
    mode: EditorMode;
    sourceSelection: SourceImageSelection | null;
  }>({ mode: "rich", sourceSelection: null });

  onChangeRef.current = onChange;
  maxLengthRef.current = maxLength;

  useEffect(() => {
    latestValueRef.current = value;
    setSourceValue(value);

    const controller = controllerRef.current;
    if (!controller || controller.getMarkdown() === value) return;

    try {
      controller.replaceMarkdown(value);
    } catch {
      setMode("source");
      setError(conversionError);
    }
  }, [value]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let cancelled = false;
    void createController({
      root,
      markdown: latestValueRef.current,
      ariaLabelledBy: `${id}-label`,
      ariaDescribedBy: `${id}-rich-help`,
      onMarkdownChange: (nextMarkdown) => {
        if (nextMarkdown === latestValueRef.current) return;
        if (nextMarkdown.length <= maxLengthRef.current) {
          latestValueRef.current = nextMarkdown;
          setSourceValue(nextMarkdown);
          onChangeRef.current(nextMarkdown);
          return;
        }

        try {
          controllerRef.current?.replaceMarkdown(latestValueRef.current);
        } catch {
          setMode("source");
          setError(conversionError);
          return;
        }
        setError(characterLimitError(maxLengthRef.current));
      },
      onToolbarStateChange: (nextToolbarState) => {
        setToolbarState(nextToolbarState);
      },
    })
      .then((controller) => {
        if (cancelled) {
          void controller.destroy();
          return;
        }

        try {
          if (controller.getMarkdown() !== latestValueRef.current) {
            controller.replaceMarkdown(latestValueRef.current);
          }
        } catch {
          void controller.destroy();
          setMode("source");
          setError(conversionError);
          return;
        }
        controllerRef.current = controller;
        setToolbarState(controller.getToolbarState());
      })
      .catch(() => {
        if (cancelled) return;
        setMode("source");
        setError(initializationError);
      });

    return () => {
      cancelled = true;
      const controller = controllerRef.current;
      controllerRef.current = null;
      if (controller) void controller.destroy();
    };
  }, [createController]);

  function switchToSource() {
    setLinkFormVisible(false);
    setMode("source");
  }

  function switchToRich() {
    const controller = controllerRef.current;
    if (!controller) return;

    try {
      const nextMarkdown = latestValueRef.current;
      if (controller.getMarkdown() !== nextMarkdown) {
        controller.replaceMarkdown(nextMarkdown);
      }
      setError("");
      setMode("rich");
    } catch {
      setMode("source");
      setError(conversionError);
    }
  }

  function runToolbarCommand(command: MarkdownEditorCommand) {
    const controller = controllerRef.current;
    if (!controller) return;

    if (command === "link") {
      if (toolbarState.link.active) {
        controller.run("link");
        controller.focus();
      } else {
        setLinkFormVisible(true);
      }
      return;
    }

    controller.run(command);
    controller.focus();
  }

  function applyLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const controller = controllerRef.current;
    if (!controller) return;

    if (controller.run("link", { href: linkUrl })) {
      setLinkUrl("");
      setLinkFormVisible(false);
      setError("");
    } else {
      setError(linkError);
    }
    controller.focus();
  }

  function removeLink() {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.run("link");
    controller.focus();
  }

  function openImageModal() {
    let nextSelectedImage: SelectedEditorImage | null = null;
    let sourceSelection: SourceImageSelection | null = null;

    if (mode === "rich") {
      nextSelectedImage = controllerRef.current?.getSelectedImage() ?? null;
    } else {
      const source = sourceRef.current;
      if (source) {
        sourceSelection = findSourceImageAtSelection(
          latestValueRef.current,
          source.selectionStart,
          source.selectionEnd,
        );
        if (sourceSelection) {
          nextSelectedImage = {
            src: sourceSelection.src,
            alt: sourceSelection.alt,
            width: sourceSelection.width,
          };
        }
      }
    }

    imageContextRef.current = { mode, sourceSelection };
    setSelectedImage(nextSelectedImage);
    setImageModalOpen(true);
  }

  function closeImageModal() {
    setImageModalOpen(false);
    setSelectedImage(null);
    imageToggleRef.current?.focus();
  }

  function applyImage({
    image,
    alt,
    width,
  }: Parameters<ImageEditorBridge["applyImage"]>[0]): boolean {
    if (sanitizeBoardImageUrl(image.url) !== image.url) return false;

    if (imageContextRef.current.mode === "rich") {
      const controller = controllerRef.current;
      if (!controller) return false;

      const previousMarkdown = latestValueRef.current;
      const didInsert = controller.run("image", {
        src: image.url,
        alt,
        width,
        replaceSelectedImage: selectedImage?.src === image.url,
      });
      if (!didInsert) return false;

      let nextMarkdown: string;
      try {
        nextMarkdown = controller.getMarkdown();
      } catch {
        try {
          controller.replaceMarkdown(previousMarkdown);
        } catch {
          setMode("source");
          setError(conversionError);
          return false;
        }
        latestValueRef.current = previousMarkdown;
        setSourceValue(previousMarkdown);
        return false;
      }
      if (nextMarkdown === previousMarkdown) return false;

      if (nextMarkdown.length > maxLengthRef.current) {
        try {
          controller.replaceMarkdown(previousMarkdown);
        } catch {
          setMode("source");
          setError(conversionError);
          return false;
        }
        latestValueRef.current = previousMarkdown;
        setSourceValue(previousMarkdown);
        setError(characterLimitError(maxLengthRef.current));
        return false;
      }

      if (latestValueRef.current !== nextMarkdown) {
        latestValueRef.current = nextMarkdown;
        setSourceValue(nextMarkdown);
        onChangeRef.current(nextMarkdown);
      }
      setError("");
      setImageModalOpen(false);
      setSelectedImage(null);
      controller.focus();
      return true;
    }

    const source = sourceRef.current;
    if (!source) return false;

    const currentValue = latestValueRef.current;
    const capturedSourceImage = imageContextRef.current.sourceSelection;
    let nextMarkdown: string;
    let nextSelection: number;

    if (capturedSourceImage?.src === image.url) {
      nextMarkdown = replaceSourceImage(currentValue, capturedSourceImage, {
        src: image.url,
        alt,
        width,
      });
      nextSelection =
        capturedSourceImage.to + (nextMarkdown.length - currentValue.length);
    } else {
      const start = source.selectionStart;
      const end = source.selectionEnd;
      const before = currentValue.slice(0, start);
      const after = currentValue.slice(end);
      const markdown = `![${escapeMarkdownAlt(alt)}](${image.url} "${serializeImageWidthTitle(width)}")`;
      const prefix = before && !before.endsWith("\n") ? "\n" : "";
      const suffix = after && !after.startsWith("\n") ? "\n" : "";
      nextMarkdown = `${before}${prefix}${markdown}${suffix}${after}`;
      nextSelection = before.length + prefix.length + markdown.length;
    }

    if (nextMarkdown === currentValue) return false;

    if (nextMarkdown.length > maxLengthRef.current) {
      setError(characterLimitError(maxLengthRef.current));
      return false;
    }

    latestValueRef.current = nextMarkdown;
    setSourceValue(nextMarkdown);
    onChangeRef.current(nextMarkdown);
    setError("");
    setImageModalOpen(false);
    setSelectedImage(null);
    requestAnimationFrame(() => {
      source.focus();
      source.setSelectionRange(nextSelection, nextSelection);
    });
    return true;
  }

  const richPanelId = `${id}-rich-panel`;
  const sourcePanelId = `${id}-source-panel`;
  const richEditorHelpId = `${id}-rich-help`;
  const imagePanelId = `${id}-image-library-panel`;
  const imageLibraryPanel = imageLibrary?.({
    open: imageModalOpen,
    selectedImage,
    applyImage,
    close: closeImageModal,
  });

  return (
    <section
      className="markdown-content-editor"
      aria-label="본문 편집기"
      onKeyDown={(event) => {
        if (event.key === "Escape" && imageModalOpen) {
          closeImageModal();
        }
      }}
    >
      <div className="markdown-editor-header">
        <div className="markdown-mode-tabs" role="tablist" aria-label="편집 모드">
          <button
            aria-controls={richPanelId}
            aria-selected={mode === "rich"}
            id={`${id}-rich-tab`}
            onClick={switchToRich}
            role="tab"
            type="button"
          >
            리치 텍스트
          </button>
          <button
            aria-controls={sourcePanelId}
            aria-selected={mode === "source"}
            id={`${id}-source-tab`}
            onClick={switchToSource}
            role="tab"
            type="button"
          >
            Markdown 원문
          </button>
        </div>

        {mode === "rich" || imageLibrary ? (
          <div className="markdown-toolbar" aria-label="서식 도구">
            {mode === "rich"
              ? toolbarGroups.map(([groupName, items]) => (
                  <div className="markdown-toolbar-group" key={groupName}>
                    {items.map(([command, label, Icon]) => {
                      const state = toolbarState[command];
                      return (
                        <button
                          aria-label={label}
                          aria-pressed={
                            selectionSensitiveToolbarCommands.has(command)
                              ? state.active
                              : undefined
                          }
                          data-tooltip={label}
                          disabled={!state.enabled}
                          key={command}
                          onClick={() => runToolbarCommand(command)}
                          type="button"
                        >
                          <Icon aria-hidden="true" size={18} strokeWidth={2} />
                        </button>
                      );
                    })}
                  </div>
                ))
              : null}
            {imageLibrary ? (
              <div className="markdown-toolbar-group markdown-image-toolbar-group">
                <button
                  aria-controls={imagePanelId}
                  aria-expanded={imageModalOpen}
                  aria-label="이미지"
                  className="markdown-image-toggle"
                  data-tooltip="이미지"
                  onClick={openImageModal}
                  ref={imageToggleRef}
                  type="button"
                >
                  <ImageIcon aria-hidden="true" size={18} strokeWidth={2} />
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {linkFormVisible && mode === "rich" ? (
        <form className="markdown-link-form" onSubmit={applyLink}>
          <label>
            URL
            <input
              inputMode="url"
              onChange={(event) => setLinkUrl(event.currentTarget.value)}
              type="text"
              value={linkUrl}
            />
          </label>
          <button type="submit">적용</button>
          <button onClick={removeLink} type="button">
            링크 제거
          </button>
        </form>
      ) : null}

      {error ? <p className="markdown-editor-error" role="alert">{error}</p> : null}

      <div
        aria-labelledby={`${id}-rich-tab`}
        className="markdown-rich-surface"
        hidden={mode !== "rich"}
        id={richPanelId}
        role="tabpanel"
      >
        <div className="markdown-editor-mount" ref={rootRef} />
        <p className="markdown-editor-help" id={richEditorHelpId}>
          서식 도구 또는 Markdown 원문으로 본문을 편집할 수 있습니다.
        </p>
      </div>

      <div
        aria-labelledby={`${id}-source-tab`}
        hidden={mode !== "source"}
        id={sourcePanelId}
        role="tabpanel"
      >
        <label htmlFor={`${id}-source-input`}>본문 Markdown 원문</label>
        <textarea
          className="markdown-source-input"
          id={`${id}-source-input`}
          onChange={(event) => {
            const nextMarkdown = event.currentTarget.value;
            if (nextMarkdown.length > maxLength) {
              event.currentTarget.value = latestValueRef.current;
              return;
            }
            latestValueRef.current = nextMarkdown;
            setSourceValue(nextMarkdown);
            onChange(nextMarkdown);
          }}
          maxLength={maxLength}
          ref={sourceRef}
          value={sourceValue}
        />
        <p>{value.length.toLocaleString("ko-KR")} / {maxLength.toLocaleString("ko-KR")}자</p>
      </div>
      {imageLibrary ? (
        <div
          className="markdown-image-panel"
          hidden={!imageModalOpen}
          id={imagePanelId}
        >
          {imageLibraryPanel}
        </div>
      ) : null}
    </section>
  );
}
