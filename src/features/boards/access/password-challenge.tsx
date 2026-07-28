"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { VerifyPasswordResult } from "./verify-password";

type PasswordChallengeProps = {
  slug: string;
  verifyAction: (input: {
    slug: string;
    password: string;
  }) => Promise<VerifyPasswordResult>;
};

export function PasswordChallenge({
  slug,
  verifyAction,
}: PasswordChallengeProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || password.length === 0) return;

    setPending(true);
    setMessage(null);
    try {
      const result = await verifyAction({ slug, password });
      setPassword("");
      if (result.status === "unlocked") {
        router.refresh();
      } else {
        setMessage(result.message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="password-challenge-page">
      <section className="password-challenge-panel" aria-labelledby="access-title">
        <p className="section-kicker">PROTECTED BOARD</p>
        <h1 id="access-title">비밀번호가 필요한 안내판입니다.</h1>
        <p className="password-challenge-intro">
          안내판을 공유한 사람에게 받은 비밀번호를 입력해 주세요.
        </p>

        <form aria-label="비밀번호 확인" onSubmit={submit}>
          <label htmlFor="board-access-password">안내판 비밀번호</label>
          <div className="password-challenge-row">
            <input
              autoComplete="current-password"
              id="board-access-password"
              maxLength={128}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <button disabled={pending || password.length === 0} type="submit">
              {pending ? "확인 중…" : "안내판 열기"}
            </button>
          </div>
        </form>

        {message ? (
          <p className="password-challenge-message" role="alert">
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
