import type { Image } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

import {
  parseImageWidthTitle,
  serializeImageWidthTitle,
  type ImageWidth,
} from "../../images/presentation";
import { sanitizeBoardImageUrl } from "../../markdown/url";

export type SourceImageSelection = {
  from: number;
  to: number;
  src: string;
  alt: string;
  width: ImageWidth;
};

type SourceImageInput = Pick<SourceImageSelection, "src" | "alt" | "width">;

export function escapeMarkdownAlt(alt: string): string {
  return alt.replace(/[\\[\]*_`&<>()~!]/g, (character) =>
    `&#${character.codePointAt(0)};`,
  );
}

export function serializeSourceImage(input: SourceImageInput): string {
  return `![${escapeMarkdownAlt(input.alt)}](${input.src} "${serializeImageWidthTitle(input.width)}")`;
}

function sourceImageSelection(node: Image): SourceImageSelection | null {
  const from = node.position?.start.offset;
  const to = node.position?.end.offset;

  if (typeof from !== "number" || typeof to !== "number") return null;
  if (sanitizeBoardImageUrl(node.url) !== node.url) return null;

  return {
    from,
    to,
    src: node.url,
    alt: node.alt ?? "",
    width: parseImageWidthTitle(node.title ?? undefined),
  };
}

function selectionOverlapsImage(
  selection: SourceImageSelection,
  start: number,
  end: number,
): boolean {
  if (start === end) {
    return selection.from <= start && start <= selection.to;
  }

  return start < selection.to && end > selection.from;
}

export function findSourceImageAtSelection(
  markdown: string,
  start: number,
  end: number,
): SourceImageSelection | null {
  const tree = unified().use(remarkParse).parse(markdown);
  let selected: SourceImageSelection | null = null;

  visit(tree, "image", (node) => {
    if (selected) return;

    const image = sourceImageSelection(node);
    if (image && selectionOverlapsImage(image, start, end)) selected = image;
  });

  return selected;
}

function selectionStillMatches(
  markdown: string,
  selection: SourceImageSelection,
): boolean {
  const current = findSourceImageAtSelection(markdown, selection.from, selection.to);

  return (
    current?.from === selection.from &&
    current.to === selection.to &&
    current.src === selection.src &&
    current.alt === selection.alt &&
    current.width === selection.width
  );
}

export function replaceSourceImage(
  markdown: string,
  selection: SourceImageSelection,
  input: SourceImageInput,
): string {
  if (!selectionStillMatches(markdown, selection)) return markdown;

  const replacement = serializeSourceImage(input);
  return `${markdown.slice(0, selection.from)}${replacement}${markdown.slice(selection.to)}`;
}

export function insertSourceImageAfter(
  markdown: string,
  selection: SourceImageSelection,
  input: SourceImageInput,
): string {
  if (!selectionStillMatches(markdown, selection)) return markdown;

  const insertion = serializeSourceImage(input);
  return `${markdown.slice(0, selection.to)}${insertion}${markdown.slice(selection.to)}`;
}
