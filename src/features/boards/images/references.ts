import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";

export function hasBoardImageReference(
  markdown: string,
  imageUrl: string,
): boolean {
  const tree = unified().use(remarkParse).parse(markdown);
  let found = false;
  const definedIdentifiers = new Set<string>();
  const matchingDefinitions = new Set<string>();

  visit(tree, "image", (node) => {
    if (node.url === imageUrl) found = true;
  });
  visit(tree, "definition", (node) => {
    if (definedIdentifiers.has(node.identifier)) return;
    definedIdentifiers.add(node.identifier);
    if (node.url === imageUrl) matchingDefinitions.add(node.identifier);
  });
  visit(tree, "imageReference", (node) => {
    if (matchingDefinitions.has(node.identifier)) found = true;
  });

  return found;
}
