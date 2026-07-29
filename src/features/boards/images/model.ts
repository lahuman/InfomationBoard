import { BOARD_SLUG_PATTERN } from "../slug";

export const ACCOUNT_STORAGE_LIMIT_BYTES = 50 * 1_048_576;
export const IMAGE_FILE_LIMIT_BYTES = 10 * 1_048_576;
export const BOARD_IMAGE_LIMIT = 20;
export const IMAGE_RESERVATION_MINUTES = 15;
export const IMAGE_BUCKET = "board-images";
export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type BoardImage = {
  id: string;
  originalFilename: string;
  mimeType: (typeof ACCEPTED_IMAGE_MIME_TYPES)[number];
  sizeBytes: number;
  url: string;
};

export type BoardImageLibrary = {
  images: BoardImage[];
  storageBytes: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);

  return (
    codePoint !== undefined &&
    (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
  );
}

export function boardImageUrl(slug: string, attachmentId: string): string {
  if (!BOARD_SLUG_PATTERN.test(slug) || !UUID_PATTERN.test(attachmentId)) {
    throw new Error("Invalid board image URL parameters.");
  }

  return `/b/${slug}/images/${attachmentId}`;
}

export function defaultImageAlt(filename: string): string {
  const displayFilename = Array.from(
    Array.from(filename)
      .filter((character) => !isControlCharacter(character))
      .join("")
      .split(/[\\/]/)
      .at(-1)
      ?.trim() ?? "",
  )
    .slice(0, 180)
    .join("");

  if (!displayFilename) return "image";

  const extensionStart = displayFilename.lastIndexOf(".");
  if (extensionStart <= 0) return displayFilename;

  return displayFilename.slice(0, extensionStart) || "image";
}
