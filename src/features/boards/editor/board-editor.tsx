"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DeleteBoardResult } from "../actions/delete-board";
import type {
  PublishBoardResult,
} from "../actions/publish-board";
import { BoardMarkdown } from "../markdown/board-markdown";
import type { PublicationInput, UpdateBoardInput } from "../schema";
import type { UpdateBoardResult } from "../actions/update-board";
import type { CancelBoardImageResult } from "../images/actions/cancel-image";
import type { DeleteBoardImageResult } from "../images/actions/delete-image";
import type { FinalizeBoardImageResult } from "../images/actions/finalize-image";
import type { ReserveBoardImageResult } from "../images/actions/reserve-image";
import { ImageLibrary } from "../images/image-library";
import type { BoardImageLibrary } from "../images/model";
import { PublicationSettings } from "../publication/publication-settings";
import type { EditorBoard, EditorDraft } from "./editor-board";
import { MarkdownContentEditor } from "./markdown-editor/markdown-content-editor";
import {
  clearRecoveryCopy,
  loadRecoveryCopy,
  saveRecoveryCopy,
  type RecoveryCopy,
} from "./recovery";

const AUTOSAVE_DELAY_MS = 750;

type SaveState =
  | "saved"
  | "dirty"
  | "saving"
  | "offline"
  | "failed"
  | "conflict";

const saveLabels: Record<SaveState, string> = {
  saved: "저장됨",
  dirty: "저장 대기",
  saving: "저장 중",
  offline: "오프라인 보관됨",
  failed: "저장 실패",
  conflict: "저장 충돌",
};

type BoardEditorImageProps = {
  initialImageLibrary: BoardImageLibrary;
  reserveImageAction: (input: {
    boardId: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
  }) => Promise<ReserveBoardImageResult>;
  finalizeImageAction: (input: {
    boardId: string;
    attachmentId: string;
  }) => Promise<FinalizeBoardImageResult>;
  cancelImageAction: (input: {
    boardId: string;
    attachmentId: string;
  }) => Promise<CancelBoardImageResult>;
  deleteImageAction: (input: {
    boardId: string;
    attachmentId: string;
  }) => Promise<DeleteBoardImageResult>;
};

type BoardEditorProps = {
  board: EditorBoard;
  canonicalUrl: string;
  deleteBoardAction: (input: { id: string }) => Promise<DeleteBoardResult>;
  publishBoardAction: (
    input: PublicationInput,
  ) => Promise<PublishBoardResult>;
  updateBoardAction: (
    input: UpdateBoardInput,
  ) => Promise<UpdateBoardResult>;
} &
  (
    | BoardEditorImageProps
    | {
        initialImageLibrary?: never;
        reserveImageAction?: never;
        finalizeImageAction?: never;
        cancelImageAction?: never;
        deleteImageAction?: never;
      }
  );

function toDraft(board: EditorBoard): EditorDraft {
  return {
    title: board.title,
    summary: board.summary,
    contentMarkdown: board.contentMarkdown,
    theme: board.theme,
  };
}

export function BoardEditor({
  board,
  canonicalUrl,
  deleteBoardAction,
  publishBoardAction,
  updateBoardAction,
  initialImageLibrary,
  reserveImageAction,
  finalizeImageAction,
  cancelImageAction,
  deleteImageAction,
}: BoardEditorProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<EditorDraft>(() => toDraft(board));
  const [revision, setRevision] = useState(board.revision);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [conflict, setConflict] = useState<EditorBoard | null>(null);
  const [recovery, setRecovery] = useState<RecoveryCopy | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteState, setDeleteState] = useState<
    "idle" | "deleting" | "error"
  >("idle");
  const [deleteError, setDeleteError] = useState("");

  const draftRef = useRef(draft);
  const revisionRef = useRef(revision);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const mountedRef = useRef(false);
  const skipNextAutosaveRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSaveRef = useRef<() => Promise<void>>(async () => undefined);

  draftRef.current = draft;
  revisionRef.current = revision;

  const runSave = useCallback(async () => {
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }

    inFlightRef.current = true;
    queuedRef.current = false;
    const snapshot = draftRef.current;
    const requestRevision = revisionRef.current;
    setSaveState("saving");

    let result: UpdateBoardResult;
    try {
      result = await updateBoardAction({
        id: board.id,
        revision: requestRevision,
        ...snapshot,
      });
    } catch {
      saveRecoveryCopy(board.id, {
        savedAt: new Date().toISOString(),
        revision: requestRevision,
        draft: draftRef.current,
      });
      setSaveState("offline");
      inFlightRef.current = false;
      return;
    }

    if (result.status === "saved") {
      revisionRef.current = result.revision;
      setRevision(result.revision);
      setConflict(null);

      const hasNewerDraft =
        queuedRef.current || draftRef.current !== snapshot;
      if (hasNewerDraft) {
        setSaveState("dirty");
      } else {
        clearRecoveryCopy(board.id);
        setSaveState("saved");
      }

      inFlightRef.current = false;
      if (hasNewerDraft) {
        void runSaveRef.current();
      }
      return;
    }

    if (result.status === "conflict") {
      setConflict(result.serverBoard);
      setSaveState("conflict");
    } else {
      setSaveState("failed");
    }

    saveRecoveryCopy(board.id, {
      savedAt: new Date().toISOString(),
      revision: requestRevision,
      draft: draftRef.current,
    });
    inFlightRef.current = false;
  }, [board.id, updateBoardAction]);

  runSaveRef.current = runSave;

  useEffect(() => {
    const localCopy = loadRecoveryCopy(board.id);
    if (
      localCopy &&
      Date.parse(localCopy.savedAt) > Date.parse(board.updatedAt)
    ) {
      setRecovery(localCopy);
    }
  }, [board.id, board.updatedAt]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }

    setSaveState("dirty");
    saveRecoveryCopy(board.id, {
      savedAt: new Date().toISOString(),
      revision: revisionRef.current,
      draft,
    });

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void runSaveRef.current();
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [board.id, draft]);

  function updateDraft(patch: Partial<EditorDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function loadServerConflict() {
    if (!conflict) return;
    skipNextAutosaveRef.current = true;
    const serverDraft = toDraft(conflict);
    draftRef.current = serverDraft;
    revisionRef.current = conflict.revision;
    setDraft(serverDraft);
    setRevision(conflict.revision);
    setConflict(null);
    clearRecoveryCopy(board.id);
    setSaveState("saved");
  }

  function retryLocalConflict() {
    if (!conflict) return;
    revisionRef.current = conflict.revision;
    setRevision(conflict.revision);
    setConflict(null);
    setSaveState("dirty");
    void runSaveRef.current();
  }

  function restoreRecovery() {
    if (!recovery) return;
    setDraft(recovery.draft);
    setRevision(recovery.revision);
    setRecovery(null);
  }

  function discardRecovery() {
    clearRecoveryCopy(board.id);
    setRecovery(null);
  }

  async function confirmDelete() {
    if (deleteState === "deleting") return;

    if (timerRef.current) clearTimeout(timerRef.current);
    setDeleteState("deleting");
    setDeleteError("");

    try {
      const result = await deleteBoardAction({ id: board.id });
      if (result.status === "deleted") {
        clearRecoveryCopy(board.id);
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      setDeleteError(result.message);
    } catch {
      setDeleteError(
        "안내판을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }

    setDeleteState("error");
  }

  return (
    <div className="board-editor">
      <div className="editor-toolbar">
        <div role="tablist" aria-label="편집 화면">
          <button
            aria-controls="board-edit-panel"
            aria-selected={activeTab === "edit"}
            onClick={() => setActiveTab("edit")}
            role="tab"
            type="button"
          >
            편집
          </button>
          <button
            aria-controls="board-preview-panel"
            aria-selected={activeTab === "preview"}
            onClick={() => setActiveTab("preview")}
            role="tab"
            type="button"
          >
            미리보기
          </button>
        </div>
        <p className={`save-state save-state-${saveState}`} role="status">
          {saveLabels[saveState]}
        </p>
      </div>

      {recovery ? (
        <aside className="editor-notice" aria-labelledby="recovery-title">
          <div>
            <strong id="recovery-title">저장되지 않은 복구본이 있습니다.</strong>
            <p>서버 초안보다 새로운 로컬 작업을 복구할 수 있습니다.</p>
          </div>
          <div>
            <button type="button" onClick={restoreRecovery}>
              복구하기
            </button>
            <button type="button" onClick={discardRecovery}>
              버리기
            </button>
          </div>
        </aside>
      ) : null}

      {conflict ? (
        <aside className="editor-notice editor-conflict" aria-labelledby="conflict-title">
          <div>
            <strong id="conflict-title">다른 저장 내용이 발견됐습니다.</strong>
            <p>로컬 내용은 보관했습니다. 사용할 내용을 선택해 주세요.</p>
          </div>
          <div>
            <button type="button" onClick={loadServerConflict}>
              서버 내용 불러오기
            </button>
            <button type="button" onClick={retryLocalConflict}>
              내 내용으로 다시 저장
            </button>
          </div>
        </aside>
      ) : null}

      <div className="editor-layout">
        <section
          className="editor-form-panel"
          data-active={activeTab === "edit"}
          id="board-edit-panel"
          role="tabpanel"
        >
          <label htmlFor="board-title">제목</label>
          <input
            id="board-title"
            maxLength={120}
            onChange={(event) =>
              updateDraft({ title: event.currentTarget.value })
            }
            value={draft.title}
          />

          <label htmlFor="board-summary">요약</label>
          <textarea
            id="board-summary"
            maxLength={300}
            onChange={(event) =>
              updateDraft({ summary: event.currentTarget.value })
            }
            rows={3}
            value={draft.summary}
          />

          <label id="board-content-label">본문</label>
          <MarkdownContentEditor
            id="board-content"
            imageLibrary={
              initialImageLibrary
                ? (insertImage) => (
                    <ImageLibrary
                      boardId={board.id}
                      boardSlug={board.slug}
                      cancelImageAction={cancelImageAction}
                      contentMarkdown={draft.contentMarkdown}
                      deleteImageAction={deleteImageAction}
                      finalizeImageAction={finalizeImageAction}
                      initialLibrary={initialImageLibrary}
                      onBoardRevision={(nextRevision) => {
                        revisionRef.current = nextRevision;
                        setRevision(nextRevision);
                      }}
                      onInsert={insertImage}
                      reserveImageAction={reserveImageAction}
                    />
                  )
                : undefined
            }
            maxLength={200_000}
            onChange={(contentMarkdown) => updateDraft({ contentMarkdown })}
            value={draft.contentMarkdown}
          />

          <div className="theme-fields">
            <label>
              색상
              <select
                onChange={(event) =>
                  updateDraft({
                    theme: {
                      ...draft.theme,
                      palette: event.currentTarget.value as EditorDraft["theme"]["palette"],
                    },
                  })
                }
                value={draft.theme.palette}
              >
                <option value="coral">코랄</option>
                <option value="blue">블루</option>
                <option value="lime">라임</option>
              </select>
            </label>
            <label>
              여백
              <select
                onChange={(event) =>
                  updateDraft({
                    theme: {
                      ...draft.theme,
                      density: event.currentTarget.value as EditorDraft["theme"]["density"],
                    },
                  })
                }
                value={draft.theme.density}
              >
                <option value="comfortable">여유롭게</option>
                <option value="compact">촘촘하게</option>
              </select>
            </label>
            <label>
              정렬
              <select
                onChange={(event) =>
                  updateDraft({
                    theme: {
                      ...draft.theme,
                      alignment: event.currentTarget.value as EditorDraft["theme"]["alignment"],
                    },
                  })
                }
                value={draft.theme.alignment}
              >
                <option value="left">왼쪽</option>
                <option value="center">가운데</option>
              </select>
            </label>
          </div>
        </section>

        <section
          className={`editor-preview-panel theme-${draft.theme.palette} density-${draft.theme.density} align-${draft.theme.alignment}`}
          data-active={activeTab === "preview"}
          id="board-preview-panel"
          role="tabpanel"
        >
          <p className="preview-kicker">{board.template.toUpperCase()}</p>
          <h2>{draft.title || "제목 없는 안내판"}</h2>
          {draft.summary ? <p className="preview-summary">{draft.summary}</p> : null}
          <BoardMarkdown markdown={draft.contentMarkdown} />
        </section>
      </div>

      <PublicationSettings
        board={board}
        canonicalUrl={canonicalUrl}
        revision={revision}
        onRevisionChange={(nextRevision) => {
          revisionRef.current = nextRevision;
          setRevision(nextRevision);
        }}
        publishBoardAction={publishBoardAction}
      />

      <section className="editor-danger-zone" aria-labelledby="danger-title">
        <div>
          <p className="section-kicker">DANGER ZONE</p>
          <h2 id="danger-title">안내판 삭제</h2>
          <p>삭제한 안내판은 복구할 수 없습니다.</p>
        </div>
        <button
          className="danger-button"
          onClick={() => {
            setDeleteError("");
            setDeleteState("idle");
            setShowDeleteConfirmation(true);
          }}
          type="button"
        >
          안내판 삭제
        </button>
      </section>

      {showDeleteConfirmation ? (
        <div
          aria-labelledby="delete-confirmation-title"
          aria-modal="true"
          className="delete-dialog-backdrop"
          role="dialog"
        >
          <div className="delete-dialog">
            <p className="section-kicker">DELETE BOARD</p>
            <h2 id="delete-confirmation-title">
              ‘{draft.title || "제목 없는 안내판"}’을 삭제할까요?
            </h2>
            <p>
              저장된 내용이 모두 삭제되며 이 작업은 되돌릴 수 없습니다.
            </p>
            {deleteError ? (
              <p className="delete-error" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="delete-dialog-actions">
              <button
                disabled={deleteState === "deleting"}
                onClick={() => setShowDeleteConfirmation(false)}
                type="button"
              >
                취소
              </button>
              <button
                className="danger-button"
                disabled={deleteState === "deleting"}
                onClick={() => void confirmDelete()}
                type="button"
              >
                {deleteState === "deleting" ? "삭제 중…" : "영구 삭제"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
