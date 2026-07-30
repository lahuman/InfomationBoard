import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_WIDTH,
  IMAGE_WIDTHS,
  imageWidthClass,
  parseImageWidthTitle,
  serializeImageWidthTitle,
} from "./presentation";

describe("image presentation", () => {
  it("accepts only the four image widths", () => {
    expect(IMAGE_WIDTHS).toEqual([25, 50, 75, 100]);
    expect(DEFAULT_IMAGE_WIDTH).toBe(100);
    expect(parseImageWidthTitle("width=25")).toBe(25);
    expect(parseImageWidthTitle("width=50")).toBe(50);
    expect(parseImageWidthTitle("width=75")).toBe(75);
    expect(parseImageWidthTitle("width=100")).toBe(100);
    expect(parseImageWidthTitle(undefined)).toBe(100);
    expect(parseImageWidthTitle("width=80")).toBe(100);
    expect(parseImageWidthTitle("width=50; color:red")).toBe(100);
  });

  it("serializes and maps only normalized widths", () => {
    expect(serializeImageWidthTitle(50)).toBe("width=50");
    expect(imageWidthClass(50)).toBe("board-image-width-50");
  });
});
