import { describe, expect, it } from "vitest";

import {
  escapeMarkdownAlt,
  findSourceImageAtSelection,
  replaceSourceImage,
} from "./source-image";

describe("findSourceImageAtSelection", () => {
  const imageUrl = "https://images.example.com/original.png";
  const image = `![원본](${imageUrl} "width=50")`;
  const markdown = `앞\n${image}\n뒤`;
  const imageFrom = markdown.indexOf(image);
  const imageTo = imageFrom + image.length;

  it("finds an image when the caret is in its alt text", () => {
    const selection = findSourceImageAtSelection(
      markdown,
      imageFrom + 3,
      imageFrom + 3,
    );

    expect(selection).toEqual({
      from: imageFrom,
      to: imageTo,
      src: imageUrl,
      alt: "원본",
      width: 50,
    });
  });

  it("finds an image when the caret is in its URL", () => {
    const caret = markdown.indexOf(imageUrl) + 12;

    expect(findSourceImageAtSelection(markdown, caret, caret)).toMatchObject({
      from: imageFrom,
      to: imageTo,
      src: imageUrl,
      alt: "원본",
      width: 50,
    });
  });

  it("finds an image when a range covers its node", () => {
    expect(findSourceImageAtSelection(markdown, imageFrom, imageTo)).toEqual({
      from: imageFrom,
      to: imageTo,
      src: imageUrl,
      alt: "원본",
      width: 50,
    });
  });

  it("returns null for selections that do not overlap an image", () => {
    expect(findSourceImageAtSelection(markdown, 0, 1)).toBeNull();
  });

  it("returns null for a caret outside either side of an image", () => {
    expect(
      findSourceImageAtSelection(markdown, imageFrom - 1, imageFrom - 1),
    ).toBeNull();
    expect(
      findSourceImageAtSelection(markdown, imageTo + 1, imageTo + 1),
    ).toBeNull();
  });

  it("does not treat ordinary links as editable images", () => {
    const link = `[원본](${imageUrl})`;
    const caret = link.indexOf(imageUrl) + 4;

    expect(findSourceImageAtSelection(link, caret, caret)).toBeNull();
  });

  it("does not select malformed image Markdown", () => {
    const malformed = `![원본](${imageUrl}`;

    expect(findSourceImageAtSelection(malformed, 4, 4)).toBeNull();
  });

  it("does not select unsafe image URLs", () => {
    const unsafe = "![원본](javascript:alert(1))";

    expect(findSourceImageAtSelection(unsafe, 4, 4)).toBeNull();
  });

  it("does not select reference-style images without a direct editable node", () => {
    const reference = `![원본][이미지]\n\n[이미지]: ${imageUrl}`;

    expect(findSourceImageAtSelection(reference, 4, 4)).toBeNull();
  });

  it.each([
    ["an absent title", `![원본](${imageUrl})`],
    ["a malformed title", `![원본](${imageUrl} "width=large")`],
    ["an unsupported width", `![원본](${imageUrl} "width=80")`],
  ])("normalizes %s to width 100 when selected and edited", (_name, source) => {
    const caret = source.indexOf("원본") + 1;
    const selection = findSourceImageAtSelection(source, caret, caret);

    expect(selection).toMatchObject({
      src: imageUrl,
      alt: "원본",
      width: 100,
    });
    const normalized = replaceSourceImage(source, selection!, {
      src: imageUrl,
      alt: "원본",
      width: selection!.width,
    });
    expect(normalized).toBe(`![원본](${imageUrl} "width=100")`);
  });
});

describe("replaceSourceImage", () => {
  const imageUrl = "https://images.example.com/original.png";

  it("replaces a captured image and escapes alt text", () => {
    const markdown = `시작\n![원본](${imageUrl} "width=50")\n끝`;
    const caret = markdown.indexOf("원본") + 1;
    const selection = findSourceImageAtSelection(markdown, caret, caret);

    expect(selection).toMatchObject({ src: imageUrl, alt: "원본", width: 50 });
    const replaced = replaceSourceImage(markdown, selection!, {
      src: imageUrl,
      alt: "대괄호 ]와 역슬래시 \\",
      width: 25,
    });
    const replacedCaret = replaced.indexOf(imageUrl) + 5;
    expect(
      findSourceImageAtSelection(replaced, replacedCaret, replacedCaret),
    ).toMatchObject({
      src: imageUrl,
      alt: "대괄호 ]와 역슬래시 \\",
      width: 25,
    });
  });

  it("leaves Markdown unchanged when the captured source image is stale", () => {
    const original = `![원본](${imageUrl} "width=50")`;
    const selection = findSourceImageAtSelection(original, 4, 4);
    const changed = `![변경됨](${imageUrl} "width=50")`;

    expect(
      replaceSourceImage(changed, selection!, {
        src: imageUrl,
        alt: "새 이미지",
        width: 100,
      }),
    ).toBe(changed);
  });

  it.each([
    ["brackets", "대괄호 [열기]와 닫기 ]"],
    ["emphasis", "*강조*와 _기울임_"],
    ["code", "`코드` 표시"],
    ["entities", "엔터티 &amp;와 &copy;"],
    ["parentheses", "괄호 (안)과 (밖)"],
    ["backslashes", "역슬래시 \\ 경로"],
  ])("round-trips %s in alt text for source insertion and update", (_name, alt) => {
    const inserted = `![${escapeMarkdownAlt(alt)}](${imageUrl} "width=50")`;
    const insertedCaret = inserted.indexOf(imageUrl) + 5;

    expect(
      findSourceImageAtSelection(inserted, insertedCaret, insertedCaret),
    ).toMatchObject({ src: imageUrl, alt, width: 50 });

    const original = `![원본](${imageUrl} "width=25")`;
    const originalSelection = findSourceImageAtSelection(original, 4, 4);
    const updated = replaceSourceImage(original, originalSelection!, {
      src: imageUrl,
      alt,
      width: 75,
    });
    const updatedCaret = updated.indexOf(imageUrl) + 5;
    expect(
      findSourceImageAtSelection(updated, updatedCaret, updatedCaret),
    ).toMatchObject({ src: imageUrl, alt, width: 75 });
  });
});
