export const IMAGE_WIDTHS = [25, 50, 75, 100] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];
export const DEFAULT_IMAGE_WIDTH: ImageWidth = 100;

export function parseImageWidthTitle(title?: string): ImageWidth {
  const match = /^width=(25|50|75|100)$/.exec(title ?? "");
  return match ? (Number(match[1]) as ImageWidth) : DEFAULT_IMAGE_WIDTH;
}

export function serializeImageWidthTitle(width: ImageWidth) {
  return `width=${width}`;
}

export function imageWidthClass(width: ImageWidth) {
  return `board-image-width-${width}`;
}
