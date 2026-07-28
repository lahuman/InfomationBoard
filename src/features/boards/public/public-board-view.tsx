import Link from "next/link";
import { BoardMarkdown } from "../markdown/board-markdown";
import type { PublicBoard } from "./public-board";

const templateLabels = {
  store: "매장 안내",
  event: "행사 안내",
  meeting: "모임 안내",
} satisfies Record<PublicBoard["template"], string>;

const publishedAtFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "long",
  timeZone: "Asia/Seoul",
});

type PublicBoardViewProps = {
  board: PublicBoard;
};

export function PublicBoardView({ board }: PublicBoardViewProps) {
  return (
    <main
      className={`public-board-page theme-${board.theme.palette} density-${board.theme.density} align-${board.theme.alignment}`}
    >
      <header className="public-board-header">
        <Link className="public-board-brand" href="/">
          INFORMATIONBOARD
        </Link>
        <p>공개 안내판</p>
      </header>

      <article className="public-board-sheet">
        <header className="public-board-hero">
          <p className="public-board-kicker">{templateLabels[board.template]}</p>
          <h1>{board.title}</h1>
          {board.summary ? (
            <p
              className="public-board-summary"
              data-testid="public-board-summary"
            >
              {board.summary}
            </p>
          ) : null}
        </header>

        <BoardMarkdown
          className="public-board-content"
          markdown={board.contentMarkdown}
        />
      </article>

      <footer className="public-board-footer">
        <p>게시된 안내판</p>
        <time dateTime={board.publishedAt}>
          {publishedAtFormatter.format(new Date(board.publishedAt))}
        </time>
      </footer>
    </main>
  );
}
