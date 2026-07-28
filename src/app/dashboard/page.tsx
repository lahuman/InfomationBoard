import Link from "next/link";
import { signOut } from "@/features/auth/actions";
import { requireUser } from "@/features/auth/require-user";

export default async function DashboardPage() {
  const user = await requireUser();

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
        <p>
          내가 만든 안내판을 한곳에서 관리하고 게시 상태를 확인할 수
          있습니다.
        </p>
      </section>

      <section className="dashboard-empty" aria-labelledby="empty-title">
        <div>
          <p className="dashboard-index" aria-hidden="true">
            00
          </p>
          <h2 id="empty-title">아직 만든 안내판이 없습니다.</h2>
          <p>
            다음 단계에서 매장, 행사, 모임에 맞는 템플릿으로 첫 안내판을
            만들 수 있습니다.
          </p>
        </div>
        <button className="dashboard-create-hint" type="button" disabled>
          안내판 만들기 · 다음 단계
        </button>
      </section>
    </main>
  );
}
