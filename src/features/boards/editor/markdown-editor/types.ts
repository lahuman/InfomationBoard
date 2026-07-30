import type { BoardImage } from "../../images/model";
import type { ImageWidth } from "../../images/presentation";

export type MarkdownEditorCommand =
  | "heading-2"
  | "heading-3"
  | "bold"
  | "italic"
  | "link"
  | "image"
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
  getSelectedImage(): SelectedEditorImage | null;
  replaceMarkdown(markdown: string): void;
  run(command: MarkdownEditorCommand, payload?: MarkdownEditorPayload): boolean;
  getToolbarState(): ToolbarState;
  focus(): void;
  destroy(): Promise<void>;
};

export type SelectedEditorImage = {
  src: string;
  alt: string;
  width: ImageWidth;
};

export type ImageEditorBridge = {
  open: boolean;
  selectedImage: SelectedEditorImage | null;
  applyImage(input: {
    image: BoardImage;
    alt: string;
    width: ImageWidth;
  }): boolean;
  close(): void;
};

export type MarkdownEditorPayload = {
  href?: string;
  src?: string;
  alt?: string;
  width?: ImageWidth;
  replaceSelectedImage?: boolean;
};

export type CreateMarkdownEditorController = (options: {
  root: HTMLElement;
  markdown: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  onMarkdownChange(markdown: string): void;
  onToolbarStateChange(state: ToolbarState): void;
}) => Promise<MarkdownEditorController>;
