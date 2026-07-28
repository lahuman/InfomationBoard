"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { AuthActionState } from "./actions";

type MagicLinkAction = (
  previous: AuthActionState,
  formData: FormData,
) => Promise<AuthActionState>;

type GoogleAction = (formData: FormData) => Promise<void>;

type LoginFormProps = {
  next: string;
  requestMagicLinkAction: MagicLinkAction;
  googleAction: GoogleAction;
};

function SubmitButton({
  children,
  className,
}: {
  children: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? "잠시만요…" : children}
    </button>
  );
}

export function LoginForm({
  next,
  requestMagicLinkAction,
  googleAction,
}: LoginFormProps) {
  const [state, magicLinkAction] = useActionState(requestMagicLinkAction, {
    status: "idle",
  });

  return (
    <div className="login-form-stack">
      <form action={magicLinkAction} className="magic-link-form">
        <input type="hidden" name="next" value={next} />
        <label htmlFor="login-email">이메일</label>
        <div className="login-email-row">
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="owner@example.com"
            required
          />
          <SubmitButton className="login-submit">매직링크 받기</SubmitButton>
        </div>
        {state.message ? (
          <p
            className={`login-message login-message-${state.status}`}
            role={state.status === "success" ? "status" : "alert"}
          >
            {state.message}
          </p>
        ) : null}
      </form>

      <div className="login-divider" aria-hidden="true">
        <span>또는</span>
      </div>

      <form action={googleAction}>
        <input type="hidden" name="next" value={next} />
        <SubmitButton className="google-submit">
          Google로 계속하기
        </SubmitButton>
      </form>
    </div>
  );
}
