"use client";

import { useEffect, useRef, useState } from "react";
import { createMilkdownEditorController } from "./milkdown-editor";
import type {
  CreateMarkdownEditorController,
  MarkdownEditorCommand,
  MarkdownEditorController,
  ToolbarState,
} from "./types";

type MarkdownContentEditorProps = {
  id: string;
  maxLength: number;
  value: string;
  onChange(markdown: string): void;
  createController?: CreateMarkdownEditorController;
};

type EditorMode = "rich" | "source";

const toolbarItems = [
  ["heading-2", "제목 2"],
  ["heading-3", "제목 3"],
  ["bold", "굵게"],
  ["italic", "기울임"],
  ["link", "링크"],
  ["bullet-list", "글머리 목록"],
  ["ordered-list", "번호 목록"],
  ["blockquote", "인용"],
  ["horizontal-rule", "구분선"],
  ["undo", "실행 취소"],
  ["redo", "다시 실행"],
] as const satisfies ReadonlyArray<readonly [MarkdownEditorCommand, string]>;

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
}: MarkdownContentEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
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
      onMarkdownChange: (nextMarkdown) => {
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
    if (command === "link") {
      setLinkFormVisible(true);
      return;
    }

    const controller = controllerRef.current;
    if (!controller) return;
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

  const richPanelId = `${id}-rich-panel`;
  const sourcePanelId = `${id}-source-panel`;

  return (
    <section className="markdown-content-editor" aria-label="본문 편집기">
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

        {mode === "rich" ? (
          <div className="markdown-toolbar" aria-label="서식 도구">
            {toolbarItems.map(([command, label]) => {
              const state = toolbarState[command];
              return (
                <button
                  aria-pressed={state.active}
                  disabled={!state.enabled}
                  key={command}
                  onClick={() => runToolbarCommand(command)}
                  type="button"
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {linkFormVisible && mode === "rich" ? (
        <form className="markdown-link-form" onSubmit={applyLink}>
          <label>
            URL
            <input
              onChange={(event) => setLinkUrl(event.currentTarget.value)}
              type="url"
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
        <div ref={rootRef} />
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
            latestValueRef.current = nextMarkdown;
            setSourceValue(nextMarkdown);
            onChange(nextMarkdown);
          }}
          value={sourceValue}
        />
        <p>{value.length.toLocaleString("ko-KR")} / {maxLength.toLocaleString("ko-KR")}자</p>
      </div>
    </section>
  );
}
