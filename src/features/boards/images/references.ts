import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";

export function hasBoardImageReference(
  markdown: string,
  imageUrl: string,
): boolean {
  const tree = unified().use(remarkParse).parse(markdown);
  let found = false;

  visit(tree, "image", (node) => {
    if (node.url === imageUrl) found = true;
  });

  return found;
}
