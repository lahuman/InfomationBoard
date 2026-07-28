"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type {
  CreateBoardActionState,
} from "./actions/create-board";
import { BOARD_TEMPLATES } from "./templates";

type CreateBoardAction = (
  previous: CreateBoardActionState,
  formData: FormData,
) => Promise<CreateBoardActionState>;

type CreateBoardFormProps = {
  createBoardAction: CreateBoardAction;
};

function CreateButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="create-board-submit"
      type="submit"
      disabled={pending}
    >
      {pending ? "안내판 만드는 중…" : "안내판 만들기"}
    </button>
  );
}

export function CreateBoardForm({
  createBoardAction,
}: CreateBoardFormProps) {
  const [state, action] = useActionState(createBoardAction, {
    status: "idle",
  });

  return (
    <form action={action} className="create-board-form">
      <fieldset
        aria-describedby={
          state.fieldErrors?.template ? "template-error" : undefined
        }
      >
        <legend>안내판 유형</legend>
        <div className="template-grid">
          {Object.values(BOARD_TEMPLATES).map((template) => (
            <label className="template-option" key={template.id}>
              <input
                defaultChecked={template.id === "event"}
                name="template"
                type="radio"
                value={template.id}
              />
              <span className="template-option-index">
                {template.eyebrow}
              </span>
              <strong>{template.label}</strong>
              <span>{template.description}</span>
              <small>{template.defaults.summary}</small>
            </label>
          ))}
        </div>
      </fieldset>

      {state.fieldErrors?.template ? (
        <p className="create-board-error" id="template-error" role="alert">
          {state.fieldErrors.template[0]}
        </p>
      ) : null}
      {state.message ? (
        <p className="create-board-error" role="alert">
          {state.message}
        </p>
      ) : null}

      <div className="create-board-actions">
        <CreateButton />
        <Link href="/dashboard">대시보드로 돌아가기</Link>
      </div>
    </form>
  );
}

