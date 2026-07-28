import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/require-user";
import { deleteBoard } from "@/features/boards/actions/delete-board";
import { updateBoard } from "@/features/boards/actions/update-board";
import { BoardEditor } from "@/features/boards/editor/board-editor";
import { getBoardForEditor } from "@/features/boards/editor/queries";

export default async function EditBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const path = `/boards/${id}/edit`;
  const user = await requireUser(path);
  const board = await getBoardForEditor(user.id, id);

  if (!board) notFound();

  return (
    <main className="edit-board-page">
      <header className="dashboard-header">
        <Link className="dashboard-brand" href="/dashboard">
          INFORMATIONBOARD
        </Link>
        <Link className="editor-dashboard-link" href="/dashboard">
          대시보드
        </Link>
      </header>

      <section className="edit-board-heading" aria-labelledby="editor-title">
        <div>
          <p className="section-kicker">PRIVATE DRAFT · AUTOSAVE</p>
          <h1 id="editor-title">안내판 편집</h1>
        </div>
        <p>입력한 내용은 자동으로 저장됩니다.</p>
      </section>

      <BoardEditor
        board={board}
        deleteBoardAction={deleteBoard}
        updateBoardAction={updateBoard}
      />
    </main>
  );
}
