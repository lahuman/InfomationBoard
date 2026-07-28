import Link from "next/link";
import {
  requestMagicLink,
  signInWithGoogle,
} from "@/features/auth/actions";
import { LoginForm } from "@/features/auth/login-form";
import {
  authErrorMessage,
  type AuthErrorCode,
} from "@/features/auth/messages";
import { safeNextPath } from "@/features/auth/redirect";

type LoginSearchParams = {
  next?: string | string[];
  error?: string | string[];
};

const visibleErrors = new Set<AuthErrorCode>([
  "google",
  "callback",
  "expired",
]);

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeNextPath(rawNext);
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  const error =
    rawError && visibleErrors.has(rawError as AuthErrorCode)
      ? authErrorMessage(rawError as AuthErrorCode)
      : null;

  return (
    <main className="login-page">
      <div className="login-orb" aria-hidden="true" />
      <Link className="login-brand" href="/">
        INFORMATIONBOARD
      </Link>
      <section className="login-panel" aria-labelledby="login-title">
        <p className="section-kicker">OWNER ACCESS · 무료 베타</p>
        <h1 id="login-title">안내판을 시작하세요.</h1>
        <p className="login-intro">
          비밀번호 없이 이메일 매직링크나 Google 계정으로 안전하게
          로그인합니다.
        </p>
        {error ? (
          <p className="login-route-error" role="alert">
            {error}
          </p>
        ) : null}
        <LoginForm
          next={next}
          requestMagicLinkAction={requestMagicLink}
          googleAction={signInWithGoogle}
        />
        <p className="login-footnote">
          로그인하면 서비스 이용에 필요한 계정이 생성됩니다.
        </p>
      </section>
    </main>
  );
}
