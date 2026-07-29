import { describe, expect, it } from "vitest";
import { hasBoardImageReference } from "./references";

const url = "/b/summer-market/images/30000000-0000-4000-8000-000000000003";

describe("hasBoardImageReference", () => {
  it("finds an exact board image URL in Markdown image syntax", () => {
    expect(hasBoardImageReference(`![포스터](${url})`, url)).toBe(true);
  });

  it("finds an exact board image URL used by a reference-style image", () => {
    expect(
      hasBoardImageReference(`![포스터][hero]\n\n[hero]: ${url}`, url),
    ).toBe(true);
  });

  it("does not mistake URL text for an image reference", () => {
    expect(hasBoardImageReference(`주소: ${url}`, url)).toBe(false);
  });

  it("does not mistake a normal Markdown link for an image reference", () => {
    expect(hasBoardImageReference(`[링크](${url})`, url)).toBe(false);
  });
});
