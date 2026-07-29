import { describe, expect, it } from "vitest";
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  ACCOUNT_STORAGE_LIMIT_BYTES,
  BOARD_IMAGE_LIMIT,
  IMAGE_BUCKET,
  IMAGE_FILE_LIMIT_BYTES,
  IMAGE_RESERVATION_MINUTES,
  boardImageUrl,
  defaultImageAlt,
} from "./model";

const imageId = "30000000-0000-4000-8000-000000000003";

describe("image model", () => {
  it("defines the account, upload, board, and reservation limits", () => {
    expect(ACCOUNT_STORAGE_LIMIT_BYTES).toBe(50 * 1_048_576);
    expect(IMAGE_FILE_LIMIT_BYTES).toBe(10 * 1_048_576);
    expect(BOARD_IMAGE_LIMIT).toBe(20);
    expect(IMAGE_RESERVATION_MINUTES).toBe(15);
  });

  it("defines the board image bucket and supported upload types", () => {
    expect(IMAGE_BUCKET).toBe("board-images");
    expect(ACCEPTED_IMAGE_MIME_TYPES).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]);
  });

  it("builds a stable public URL for a valid board slug and image ID", () => {
    expect(boardImageUrl("summer-market", imageId)).toBe(
      `/b/summer-market/images/${imageId}`,
    );
  });

  it("rejects slugs and image IDs that cannot safely form a public URL", () => {
    expect(() => boardImageUrl("Summer Market", imageId)).toThrow();
    expect(() => boardImageUrl("summer-market", "not-a-uuid")).toThrow();
  });

  it("derives accessible alt text from a safe display filename", () => {
    expect(defaultImageAlt("poster.final.png")).toBe("poster.final");
    expect(defaultImageAlt("  /uploads/\u0000festival.poster.final.webp  ")).toBe(
      "festival.poster.final",
    );
  });

  it("caps derived display filenames at 180 Unicode code points", () => {
    expect(Array.from(defaultImageAlt(`${"🖼".repeat(181)}.png`))).toHaveLength(
      180,
    );
  });
});
