export type MarkdownEditorCommand =
  | "heading-2"
  | "heading-3"
  | "bold"
  | "italic"
  | "link"
  | "bullet-list"
  | "ordered-list"
  | "blockquote"
  | "horizontal-rule"
  | "undo"
  | "redo";

export type ToolbarState = Record<
  MarkdownEditorCommand,
  { active: boolean; enabled: boolean }
>;

export type MarkdownEditorController = {
  getMarkdown(): string;
  replaceMarkdown(markdown: string): void;
  run(command: MarkdownEditorCommand, payload?: { href?: string }): boolean;
  getToolbarState(): ToolbarState;
  focus(): void;
  destroy(): Promise<void>;
};

export type CreateMarkdownEditorController = (options: {
  root: HTMLElement;
  markdown: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  onMarkdownChange(markdown: string): void;
  onToolbarStateChange(state: ToolbarState): void;
}) => Promise<MarkdownEditorController>;
