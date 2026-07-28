import Link from "next/link";
import type { DashboardBoard } from "./queries";

const updatedAtFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: "Asia/Seoul",
});

const templateLabels: Record<string, string> = {
  store: "매장 안내",
  event: "행사 안내",
  meeting: "모임 안내",
};

const statusLabels: Record<string, string> = {
  draft: "초안",
  published: "게시됨",
};

function displayTitle(title: string) {
  return title.trim() || "제목 없는 안내판";
}

function displayUpdatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "업데이트 정보 없음"
    : updatedAtFormatter.format(date);
}

type BoardListProps = {
  boards: DashboardBoard[];
};

export function BoardList({ boards }: BoardListProps) {
  if (boards.length === 0) {
    return (
      <section className="dashboard-empty" aria-labelledby="empty-title">
        <div>
          <p className="dashboard-index" aria-hidden="true">
            00
          </p>
          <h2 id="empty-title">아직 만든 안내판이 없습니다.</h2>
          <p>
            매장, 행사, 모임에 맞는 템플릿으로 첫 안내판을 만들어
            보세요.
          </p>
        </div>
        <Link className="dashboard-create-action" href="/boards/new">
          첫 안내판 만들기
        </Link>
      </section>
    );
  }

  return (
    <section className="board-list-section" aria-labelledby="board-list-title">
      <div className="board-list-heading">
        <div>
          <p className="dashboard-index" aria-hidden="true">
            {String(boards.length).padStart(2, "0")}
          </p>
          <h2 id="board-list-title">안내판 목록</h2>
        </div>
        <Link className="dashboard-create-action" href="/boards/new">
          새 안내판 만들기
        </Link>
      </div>

      <ul className="board-list">
        {boards.map((board, index) => {
          const title = displayTitle(board.title);
          return (
            <li className="board-list-item" key={board.id}>
              <p className="board-list-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </p>
              <div className="board-list-copy">
                <p className="board-list-meta">
                  <span>{templateLabels[board.template] ?? "안내판"}</span>
                  <span>{statusLabels[board.status] ?? "상태 확인 필요"}</span>
                </p>
                <h3>{title}</h3>
                <p>
                  최근 수정{" "}
                  <time dateTime={board.updatedAt}>
                    {displayUpdatedAt(board.updatedAt)}
                  </time>
                </p>
              </div>
              <Link
                aria-label={`${title} 편집`}
                className="board-edit-link"
                href={`/boards/${board.id}/edit`}
              >
                편집
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

