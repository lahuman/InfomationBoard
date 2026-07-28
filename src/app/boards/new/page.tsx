import Link from "next/link";
import { requireUser } from "@/features/auth/require-user";
import { createBoard } from "@/features/boards/actions/create-board";
import { CreateBoardForm } from "@/features/boards/create-board-form";

export default async function NewBoardPage() {
  const user = await requireUser("/boards/new");

  return (
    <main className="new-board-page">
      <header className="dashboard-header">
        <Link className="dashboard-brand" href="/dashboard">
          INFORMATIONBOARD
        </Link>
        <span className="new-board-account">
          {user.email ?? "로그인 사용자"}
        </span>
      </header>

      <section className="new-board-hero" aria-labelledby="new-board-title">
        <p className="section-kicker">NEW BOARD · PRIVATE DRAFT</p>
        <h1 id="new-board-title">어떤 안내판을 만들까요?</h1>
        <p>
          목적에 가까운 템플릿을 고르세요. 제목과 내용은 만든 뒤 바로
          수정할 수 있습니다.
        </p>
      </section>

      <CreateBoardForm createBoardAction={createBoard} />
    </main>
  );
}

