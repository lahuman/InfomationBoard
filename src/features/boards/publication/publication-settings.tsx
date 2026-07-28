"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PublishBoardResult } from "../actions/publish-board";
import type { PublicationInput } from "../schema";

type PublicationSettingsProps = {
  board: {
    id: string;
    revision: number;
    status: "draft" | "published";
    visibility: "private" | "public" | "password";
    allowIndexing: boolean;
    publishedAt: string | null;
  };
  canonicalUrl: string;
  onRevisionChange: (revision: number) => void;
  publishBoardAction: (
    input: PublicationInput,
  ) => Promise<PublishBoardResult>;
};

export function PublicationSettings(_props: PublicationSettingsProps) {
  const {
    board,
    canonicalUrl,
    onRevisionChange,
    publishBoardAction,
  } = _props;
  const router = useRouter();
  const initialMode =
    board.status === "draft"
      ? "private-draft"
      : board.visibility === "password"
        ? "password"
        : "public";
  const [mode, setMode] = useState<PublicationInput["mode"]>(initialMode);
  const [currentMode, setCurrentMode] =
    useState<PublicationInput["mode"]>(initialMode);
  const [currentRevision, setCurrentRevision] = useState(board.revision);
  const [allowIndexing, setAllowIndexing] = useState(board.allowIndexing);
  const [currentAllowIndexing, setCurrentAllowIndexing] = useState(
    board.allowIndexing,
  );
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const [showWithdrawConfirmation, setShowWithdrawConfirmation] =
    useState(false);

  const lifecycleLabel =
    currentMode === "private-draft" ? "초안" : "게시됨";
  const visibilityLabel =
    currentMode === "public"
      ? "전체 공개"
      : currentMode === "password"
        ? "비밀번호 보호"
        : "비공개 초안";
  const indexingLabel =
    currentMode === "public" && currentAllowIndexing
      ? "검색 노출 허용"
      : "검색 노출 차단";

  async function savePublication() {
    if (state === "saving") return;
    setState("saving");
    setMessage("");

    const input: PublicationInput =
      mode === "public"
        ? {
            id: board.id,
            revision: currentRevision,
            mode,
            allowIndexing,
          }
        : mode === "password"
          ? {
              id: board.id,
              revision: currentRevision,
              mode,
              password,
            }
          : {
              id: board.id,
              revision: currentRevision,
              mode,
            };

    let result: PublishBoardResult;
    try {
      result = await publishBoardAction(input);
    } catch {
      setState("error");
      setMessage("게시 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    if (result.status === "saved") {
      setCurrentRevision(result.revision);
      setCurrentMode(mode);
      setCurrentAllowIndexing(mode === "public" ? allowIndexing : false);
      setShowWithdrawConfirmation(false);
      if (mode === "password") setPassword("");
      onRevisionChange(result.revision);
      setState("idle");
      setMessage("게시 설정을 저장했습니다.");
      router.refresh();
      return;
    }

    if (result.status === "conflict") {
      const conflictMode =
        result.current.status === "draft"
          ? "private-draft"
          : result.current.visibility === "password"
            ? "password"
            : "public";
      setCurrentRevision(result.current.revision);
      setCurrentMode(conflictMode);
      setMode(conflictMode);
      setAllowIndexing(result.current.allowIndexing);
      setCurrentAllowIndexing(result.current.allowIndexing);
      onRevisionChange(result.current.revision);
      setMessage("다른 저장 내용이 발견됐습니다. 최신 상태를 확인해 주세요.");
    } else {
      setMessage(result.message);
    }
    setState("error");
  }

  function submitPublication() {
    if (currentMode !== "private-draft" && mode === "private-draft") {
      setShowWithdrawConfirmation(true);
      return;
    }
    void savePublication();
  }

  return (
    <section className="publication-settings" aria-labelledby="publication-title">
      <div className="publication-heading">
        <div>
          <p className="section-kicker">PUBLISHING</p>
          <h2 id="publication-title">게시 설정</h2>
        </div>
        <dl className="publication-summary">
          <div>
            <dt>상태</dt>
            <dd>{lifecycleLabel}</dd>
          </div>
          <div>
            <dt>접근</dt>
            <dd>{visibilityLabel}</dd>
          </div>
          <div>
            <dt>검색</dt>
            <dd>{indexingLabel}</dd>
          </div>
        </dl>
      </div>

      <div className="publication-url">
        <span>고정 주소</span>
        <a href={canonicalUrl} rel="noreferrer" target="_blank">
          {canonicalUrl}
        </a>
      </div>

      <fieldset className="publication-options" disabled={state === "saving"}>
        <legend>공개 방식</legend>
        <label>
          <input
            checked={mode === "public"}
            name="publication-mode"
            onChange={() => setMode("public")}
            type="radio"
          />
          <span>
            <strong>전체 공개</strong>
            <small>주소를 아는 누구나 바로 볼 수 있습니다.</small>
          </span>
        </label>
        <label>
          <input
            checked={mode === "password"}
            name="publication-mode"
            onChange={() => setMode("password")}
            type="radio"
          />
          <span>
            <strong>비밀번호 보호</strong>
            <small>방문 비밀번호를 확인한 뒤 내용을 표시합니다.</small>
          </span>
        </label>
        <label>
          <input
            checked={mode === "private-draft"}
            name="publication-mode"
            onChange={() => setMode("private-draft")}
            type="radio"
          />
          <span>
            <strong>비공개 초안</strong>
            <small>소유자만 편집 화면에서 볼 수 있습니다.</small>
          </span>
        </label>
      </fieldset>

      {mode === "public" ? (
        <label className="publication-toggle">
          <input
            checked={allowIndexing}
            onChange={(event) => setAllowIndexing(event.currentTarget.checked)}
            type="checkbox"
          />
          검색엔진 노출 허용
        </label>
      ) : null}

      {mode === "password" ? (
        <label className="publication-password">
          방문 비밀번호
          <input
            autoComplete="new-password"
            maxLength={128}
            minLength={8}
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
            type="password"
            value={password}
          />
          <small>8자 이상 128자 이하로 입력해 주세요.</small>
        </label>
      ) : null}

      {message ? (
        <p className="publication-message" role={state === "error" ? "alert" : "status"}>
          {message}
        </p>
      ) : null}

      <button
        className="publication-save"
        disabled={state === "saving" || (mode === "password" && password.length === 0)}
        onClick={submitPublication}
        type="button"
      >
        {state === "saving" ? "저장 중…" : "게시 설정 저장"}
      </button>

      {showWithdrawConfirmation ? (
        <div
          aria-labelledby="withdraw-title"
          aria-modal="true"
          className="delete-dialog-backdrop"
          role="dialog"
        >
          <div className="delete-dialog">
            <p className="section-kicker">WITHDRAW BOARD</p>
            <h2 id="withdraw-title">공개를 중단할까요?</h2>
            <p>방문자 링크와 QR에서 안내판을 더 이상 볼 수 없습니다.</p>
            <div className="delete-dialog-actions">
              <button
                onClick={() => setShowWithdrawConfirmation(false)}
                type="button"
              >
                취소
              </button>
              <button
                className="danger-button"
                onClick={() => void savePublication()}
                type="button"
              >
                공개 중단
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
