import Link from "next/link";
import { PublicBoardSheet } from "../public/public-board-view";
import type { SampleBoard } from "./sample-boards";

type SampleBoardPageViewProps = {
  sample: SampleBoard;
};

export function SampleBoardPageView({ sample }: SampleBoardPageViewProps) {
  const { board } = sample;

  return (
    <main
      className={`public-board-page sample-board-page theme-${board.theme.palette} density-${board.theme.density} align-${board.theme.alignment}`}
    >
      <nav className="sample-board-nav" aria-label="활용 예시 안내">
        <p>활용 예시 · {sample.label}</p>
        <div>
          <Link href="/#examples">다른 예시 보기</Link>
          <Link className="sample-board-primary-action" href="/login">
            내 안내판 만들기
          </Link>
        </div>
      </nav>

      <PublicBoardSheet board={board} />
    </main>
  );
}
