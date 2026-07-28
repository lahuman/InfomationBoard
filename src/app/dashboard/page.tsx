import Link from "next/link";
import { signOut } from "@/features/auth/actions";
import { requireUser } from "@/features/auth/require-user";
import { BoardList } from "@/features/boards/board-list";
import { getDashboardData } from "@/features/boards/queries";
import { StorageMeter } from "@/features/boards/storage-meter";

export default async function DashboardPage() {
  const user = await requireUser();
  let dashboardData: Awaited<ReturnType<typeof getDashboardData>> | null =
    null;

  try {
    dashboardData = await getDashboardData(user.id);
  } catch {
    // The dashboard renders a safe retry state without leaking DB details.
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <Link className="dashboard-brand" href="/">
          INFORMATIONBOARD
        </Link>
        <div className="dashboard-account">
          <span>{user.email ?? "로그인 사용자"}</span>
          <form action={signOut}>
            <button type="submit">로그아웃</button>
          </form>
        </div>
      </header>

      <section className="dashboard-hero" aria-labelledby="dashboard-title">
        <p className="section-kicker">OWNER DASHBOARD · PRIVATE</p>
        <h1 id="dashboard-title">내 안내판</h1>
        <p className="dashboard-hero-copy">
          내가 만든 안내판을 한곳에서 관리하고 게시 상태를 확인할 수
          있습니다.
        </p>
        <Link className="dashboard-hero-action" href="/boards/new">
          안내판 만들기
        </Link>
      </section>

      {dashboardData ? (
        <>
          <StorageMeter storageBytes={dashboardData.storageBytes} />
          <BoardList boards={dashboardData.boards} />
        </>
      ) : (
        <section
          className="dashboard-load-error"
          aria-labelledby="dashboard-error-title"
        >
          <div>
            <p className="dashboard-index" aria-hidden="true">
              ERROR
            </p>
            <h2 id="dashboard-error-title">
              안내판을 불러오지 못했습니다.
            </h2>
          <p>
              잠시 후 다시 시도해 주세요. 문제가 계속되면 새로고침해
              주세요.
          </p>
          </div>
          <Link className="dashboard-create-action" href="/dashboard">
            다시 불러오기
          </Link>
        </section>
      )}
    </main>
  );
}
