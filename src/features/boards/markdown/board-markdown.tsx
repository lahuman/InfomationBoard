import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { isExternalBoardUrl, sanitizeBoardUrl } from "./url";

const BOARD_MARKDOWN_ELEMENTS = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
];

const BOARD_SANITIZE_SCHEMA = {
  tagNames: BOARD_MARKDOWN_ELEMENTS,
  attributes: {
    a: ["href", "title"],
    code: [["className", /^language-/]],
    td: ["align"],
    th: ["align"],
  },
  protocols: {
    href: ["http", "https", "mailto"],
  },
  clobberPrefix: "board-",
};

const BOARD_MARKDOWN_COMPONENTS: Components = {
  ul({ children }) {
    return <ul className="board-markdown-list-unordered">{children}</ul>;
  },
  ol({ children, start }) {
    return (
      <ol className="board-markdown-list-ordered" start={start}>
        {children}
      </ol>
    );
  },
  a({ children, href }) {
    const safeHref = sanitizeBoardUrl(href ?? "");
    if (!safeHref) return <span>{children}</span>;

    const external = isExternalBoardUrl(safeHref);
    return (
      <a
        href={safeHref}
        rel={external ? "noopener noreferrer" : undefined}
        target={external ? "_blank" : undefined}
      >
        {children}
        {external ? (
          <span aria-hidden="true" className="external-link-indicator">
            ↗
          </span>
        ) : null}
      </a>
    );
  },
};

type BoardMarkdownProps = {
  markdown: string;
  className?: string;
};

export function BoardMarkdown({
  markdown,
  className,
}: BoardMarkdownProps) {
  return (
    <div
      className={["board-markdown", className].filter(Boolean).join(" ")}
      data-testid="board-markdown"
    >
      <ReactMarkdown
        allowedElements={BOARD_MARKDOWN_ELEMENTS}
        components={BOARD_MARKDOWN_COMPONENTS}
        rehypePlugins={[[rehypeSanitize, BOARD_SANITIZE_SCHEMA]]}
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={sanitizeBoardUrl}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
