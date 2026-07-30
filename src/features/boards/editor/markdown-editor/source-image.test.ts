import { describe, expect, it } from "vitest";

import {
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
});

describe("replaceSourceImage", () => {
  const imageUrl = "https://images.example.com/original.png";

  it("replaces a captured image and escapes alt text", () => {
    const markdown = `시작\n![원본](${imageUrl} "width=50")\n끝`;
    const caret = markdown.indexOf("원본") + 1;
    const selection = findSourceImageAtSelection(markdown, caret, caret);

    expect(selection).toMatchObject({ src: imageUrl, alt: "원본", width: 50 });
    expect(
      replaceSourceImage(markdown, selection!, {
        src: imageUrl,
        alt: "대괄호 ]와 역슬래시 \\",
        width: 25,
      }),
    ).toContain(
      `![대괄호 \\]와 역슬래시 \\\\](${imageUrl} "width=25")`,
    );
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
});
