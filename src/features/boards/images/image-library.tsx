"use client";

/* eslint-disable @next/next/no-img-element -- Private board image routes are runtime URLs without static dimensions. */

import { useEffect, useRef, useState } from "react";
import { ModalDialog } from "../../../components/modal-dialog";
import type { ImageEditorBridge } from "../editor/markdown-editor/types";
import { formatStorageBytes } from "../storage-meter";
import type { CancelBoardImageResult } from "./actions/cancel-image";
import type { DeleteBoardImageResult } from "./actions/delete-image";
import type { FinalizeBoardImageResult } from "./actions/finalize-image";
import type { ReserveBoardImageResult } from "./actions/reserve-image";
import {
  ACCOUNT_STORAGE_LIMIT_BYTES,
  BOARD_IMAGE_LIMIT,
  defaultImageAlt,
  type BoardImage,
  type BoardImageLibrary,
} from "./model";
import {
  DEFAULT_IMAGE_WIDTH,
  IMAGE_WIDTHS,
  type ImageWidth,
} from "./presentation";
import { hasBoardImageReference } from "./references";
import {
  uploadBoardImage,
  type UploadBoardImageInput,
  type UploadBoardImageResult,
} from "./upload-image";

type ReserveImageAction = (
  input: {
    boardId: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
  },
) => Promise<ReserveBoardImageResult>;

type FinalizeImageAction = (
  input: { boardId: string; attachmentId: string },
) => Promise<FinalizeBoardImageResult>;

type CancelImageAction = (
  input: { boardId: string; attachmentId: string },
) => Promise<CancelBoardImageResult>;

type DeleteImageAction = (
  input: { boardId: string; attachmentId: string },
) => Promise<DeleteBoardImageResult>;

type UploadImage = (
  input: UploadBoardImageInput,
  actions: {
    reserveAction: ReserveImageAction;
    finalizeAction: FinalizeImageAction;
    cancelAction: CancelImageAction;
  },
) => Promise<UploadBoardImageResult>;

export type ImageLibraryProps = {
  boardId: string;
  boardSlug: string;
  bridge: ImageEditorBridge;
  initialLibrary: BoardImageLibrary;
  contentMarkdown: string;
  onBoardRevision(revision: number): void;
  uploadImage?: UploadImage;
  reserveImageAction: ReserveImageAction;
  finalizeImageAction: FinalizeImageAction;
  cancelImageAction: CancelImageAction;
  deleteImageAction: DeleteImageAction;
};

type LiveMessage = {
  kind: "status" | "alert";
  text: string;
};

function initialAltText(images: BoardImage[]): Record<string, string> {
  return Object.fromEntries(
    images.map((image) => [image.id, defaultImageAlt(image.originalFilename)]),
  );
}

function initialWidths(images: BoardImage[]): Record<string, ImageWidth> {
  return Object.fromEntries(
    images.map((image) => [image.id, DEFAULT_IMAGE_WIDTH]),
  );
}

export function ImageLibrary({
  boardId,
  boardSlug,
  bridge,
  initialLibrary,
  contentMarkdown,
  onBoardRevision,
  uploadImage = uploadBoardImage,
  reserveImageAction,
  finalizeImageAction,
  cancelImageAction,
  deleteImageAction,
}: ImageLibraryProps) {
  const [images, setImages] = useState(initialLibrary.images);
  const [storageBytes, setStorageBytes] = useState(initialLibrary.storageBytes);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [altText, setAltText] = useState<Record<string, string>>(() =>
    initialAltText(initialLibrary.images),
  );
  const [widths, setWidths] = useState<Record<string, ImageWidth>>(() =>
    initialWidths(initialLibrary.images),
  );
  const [decorativeIds, setDecorativeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [dialog, setDialog] = useState<"manage" | "delete">("manage");
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [restoreDeleteFocus, setRestoreDeleteFocus] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<
    string | null
  >(null);
  const [inputKey, setInputKey] = useState(0);
  const [message, setMessage] = useState<LiveMessage | null>(null);
  const wasOpenRef = useRef(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const confirmDeleteRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!bridge.open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;

    wasOpenRef.current = true;
    setDialog("manage");
    setDeleteConfirmationId(null);
    setRestoreDeleteFocus(false);

    const selected = bridge.selectedImage;
    const matchingImage = selected
      ? images.find((image) => image.url === selected.src)
      : undefined;
    setSelectedImageId(matchingImage?.id ?? null);
    if (!selected || !matchingImage) return;

    setAltText((current) => ({
      ...current,
      [matchingImage.id]: selected.alt,
    }));
    setWidths((current) => ({
      ...current,
      [matchingImage.id]: selected.width,
    }));
    setDecorativeIds((current) => {
      const next = new Set(current);
      if (selected.alt) next.delete(matchingImage.id);
      else next.add(matchingImage.id);
      return next;
    });
  }, [bridge.open, bridge.selectedImage, images]);

  const uploadDisabled =
    pendingOperation !== null ||
    storageBytes >= ACCOUNT_STORAGE_LIMIT_BYTES ||
    images.length >= BOARD_IMAGE_LIMIT;
  const remainingBytes = Math.max(
    0,
    ACCOUNT_STORAGE_LIMIT_BYTES - storageBytes,
  );

  async function upload(file: File) {
    setSelectedFile(file);
    setPendingOperation("upload");
    setMessage({ kind: "status", text: "업로드 중" });

    let result: UploadBoardImageResult;
    try {
      result = await uploadImage(
        {
          boardId,
          file,
          storageBytes,
          imageCount: images.length,
        },
        {
          reserveAction: reserveImageAction,
          finalizeAction: finalizeImageAction,
          cancelAction: cancelImageAction,
        },
      );
    } catch {
      result = {
        status: "error",
        message: "이미지를 업로드하지 못했습니다. 다시 시도해 주세요.",
      };
    }

    if (result.status === "ready") {
      setImages((current) =>
        current.some((image) => image.id === result.image.id)
          ? current
          : [...current, result.image],
      );
      setStorageBytes(result.storageBytes);
      setAltText((current) => ({
        ...current,
        [result.image.id]: defaultImageAlt(result.image.originalFilename),
      }));
      setWidths((current) => ({
        ...current,
        [result.image.id]: DEFAULT_IMAGE_WIDTH,
      }));
      setMessage({ kind: "status", text: "업로드 완료" });
    } else {
      setMessage({ kind: "alert", text: result.message });
    }
    setSelectedFile(null);
    setInputKey((current) => current + 1);
    setPendingOperation(null);
  }

  function apply(image: BoardImage) {
    const decorative = decorativeIds.has(image.id);
    const alt = decorative ? "" : (altText[image.id] ?? "").trim();
    if (!decorative && !alt) {
      setMessage({
        kind: "alert",
        text: "대체 텍스트를 입력하거나 장식용으로 표시해 주세요.",
      });
      return;
    }

    if (
      bridge.applyImage({
        image,
        alt,
        width: widths[image.id] ?? DEFAULT_IMAGE_WIDTH,
      })
    ) {
      setMessage({ kind: "status", text: "본문에 이미지를 삽입했습니다." });
    } else {
      setMessage({
        kind: "alert",
        text: "이미지를 본문에 삽입하지 못했습니다.",
      });
    }
  }

  function requestDelete(image: BoardImage) {
    if (hasBoardImageReference(contentMarkdown, image.url)) {
      setDeleteConfirmationId(null);
      setMessage({
        kind: "alert",
        text: "본문에서 이 이미지를 먼저 제거해 주세요.",
      });
      return;
    }
    setMessage(null);
    setDeleteConfirmationId(image.id);
    setRestoreDeleteFocus(false);
    setDialog("delete");
  }

  function cancelDelete() {
    setRestoreDeleteFocus(true);
    setDialog("manage");
  }

  async function confirmDelete(image: BoardImage) {
    if (hasBoardImageReference(contentMarkdown, image.url)) {
      setDialog("manage");
      setRestoreDeleteFocus(false);
      setMessage({
        kind: "alert",
        text: "본문에서 이 이미지를 먼저 제거해 주세요.",
      });
      return;
    }

    setPendingOperation(image.id);
    setDeleteConfirmationId(null);
    setRestoreDeleteFocus(false);
    setDialog("manage");
    setMessage({ kind: "status", text: "이미지 삭제 중" });

    let result: DeleteBoardImageResult;
    try {
      result = await deleteImageAction({
        boardId,
        attachmentId: image.id,
      });
    } catch {
      result = {
        status: "error",
        message: "이미지를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      };
    }

    if ("boardRevision" in result && result.boardRevision !== undefined) {
      onBoardRevision(result.boardRevision);
    }

    if (result.status === "deleted") {
      setImages((current) => current.filter((item) => item.id !== image.id));
      setStorageBytes((current) =>
        result.storageBytes === undefined
          ? Math.max(0, current - image.sizeBytes)
          : result.storageBytes,
      );
      setAltText((current) => {
        const next = { ...current };
        delete next[image.id];
        return next;
      });
      setWidths((current) => {
        const next = { ...current };
        delete next[image.id];
        return next;
      });
      setDecorativeIds((current) => {
        const next = new Set(current);
        next.delete(image.id);
        return next;
      });
      setSelectedImageId((current) =>
        current === image.id ? null : current,
      );
      setMessage({ kind: "status", text: "이미지를 삭제했습니다." });
    } else {
      setMessage({ kind: "alert", text: result.message });
    }
    setPendingOperation(null);
  }

  const deletionImage = images.find(
    (image) => image.id === deleteConfirmationId,
  );
  const showDeleteDialog = dialog === "delete" && deletionImage !== undefined;

  return (
    <div
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
      }}
    >
      <ModalDialog
        initialFocusRef={
          showDeleteDialog
            ? confirmDeleteRef
            : restoreDeleteFocus
              ? deleteButtonRef
              : undefined
        }
        onClose={showDeleteDialog ? cancelDelete : bridge.close}
        open={bridge.open}
        title={showDeleteDialog ? "이미지 삭제" : "이미지 관리"}
        titleId={`${boardSlug}-image-library-dialog-title`}
      >
        {showDeleteDialog ? (
          <div className="image-library image-library-delete">
            <p>{deletionImage.originalFilename}을 삭제할까요?</p>
            <p>삭제한 이미지는 복구할 수 없습니다.</p>
            <div className="image-library-actions">
              <button onClick={cancelDelete} type="button">
                취소
              </button>
              <button
                className="image-library-delete-confirm"
                onClick={() => void confirmDelete(deletionImage)}
                ref={confirmDeleteRef}
                type="button"
              >
                {deletionImage.originalFilename} 삭제 확인
              </button>
            </div>
          </div>
        ) : (
          <div className="image-library" data-board-slug={boardSlug}>
            <div className="image-library-heading">
              <p>
                이미지를 업로드하고 본문의 현재 선택 위치에 삽입할 수
                있습니다.
              </p>
              <p className="image-library-usage">
                {formatStorageBytes(storageBytes)} /{" "}
                {formatStorageBytes(ACCOUNT_STORAGE_LIMIT_BYTES)}
              </p>
            </div>

            <meter
              aria-label="이미지 저장공간 사용량"
              max={ACCOUNT_STORAGE_LIMIT_BYTES}
              min={0}
              value={Math.min(storageBytes, ACCOUNT_STORAGE_LIMIT_BYTES)}
            />
            <div className="image-library-limits">
              <span>남은 공간 {formatStorageBytes(remainingBytes)}</span>
              <span>이미지당 최대 10 MB · 안내판당 최대 20개</span>
            </div>

            <div className="image-library-upload">
              <label htmlFor={`${boardSlug}-image-upload`}>이미지 추가</label>
              <input
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={uploadDisabled}
                id={`${boardSlug}-image-upload`}
                key={inputKey}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void upload(file);
                }}
                type="file"
              />
              {selectedFile && pendingOperation === "upload" ? (
                <span>{selectedFile.name}</span>
              ) : null}
            </div>

            {message ? (
              <p
                className={`image-library-message image-library-message-${message.kind}`}
                role={message.kind}
              >
                {message.text}
              </p>
            ) : null}

            {images.length ? (
              <ul className="image-library-grid">
                {images.map((image) => {
                  const decorative = decorativeIds.has(image.id);
                  const isPending = pendingOperation === image.id;
                  const isSelected = selectedImageId === image.id;
                  return (
                    <li
                      className="image-library-card"
                      data-selected={isSelected || undefined}
                      key={image.id}
                    >
                      <img alt="" loading="lazy" src={image.url} />
                      <div className="image-library-card-content">
                        <div>
                          <strong>{image.originalFilename}</strong>
                          <span>{formatStorageBytes(image.sizeBytes)}</span>
                        </div>
                        <label>
                          대체 텍스트
                          <input
                            aria-label={`${image.originalFilename} 대체 텍스트`}
                            disabled={decorative || isPending}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setAltText((current) => ({
                                ...current,
                                [image.id]: value,
                              }));
                            }}
                            type="text"
                            value={altText[image.id] ?? ""}
                          />
                        </label>
                        <label className="image-library-decorative image-library-decorative-target">
                          <input
                            aria-label={`${image.originalFilename} 장식용 이미지`}
                            checked={decorative}
                            disabled={isPending}
                            onChange={(event) => {
                              const checked = event.currentTarget.checked;
                              setDecorativeIds((current) => {
                                const next = new Set(current);
                                if (checked) next.add(image.id);
                                else next.delete(image.id);
                                return next;
                              });
                            }}
                            type="checkbox"
                          />
                          장식용 이미지
                        </label>
                        <fieldset
                          aria-label={`${image.originalFilename} 이미지 크기`}
                          className="image-library-widths"
                          disabled={isPending}
                        >
                          <legend>이미지 크기</legend>
                          <div>
                            {IMAGE_WIDTHS.map((width) => (
                              <label
                                className="image-library-width-option"
                                data-selected={
                                  widths[image.id] === width || undefined
                                }
                                key={width}
                              >
                                <input
                                  checked={
                                    (widths[image.id] ??
                                      DEFAULT_IMAGE_WIDTH) === width
                                  }
                                  name={`${boardSlug}-${image.id}-width`}
                                  onChange={() =>
                                    setWidths((current) => ({
                                      ...current,
                                      [image.id]: width,
                                    }))
                                  }
                                  type="radio"
                                  value={width}
                                />
                                본문 너비의 {width}%
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <div className="image-library-actions">
                          <button
                            disabled={pendingOperation !== null}
                            onClick={() => apply(image)}
                            type="button"
                          >
                            {isSelected
                              ? "이미지 수정"
                              : `${image.originalFilename} 삽입`}
                          </button>
                          <button
                            disabled={pendingOperation !== null}
                            onClick={() => requestDelete(image)}
                            ref={
                              deleteConfirmationId === image.id
                                ? deleteButtonRef
                                : undefined
                            }
                            type="button"
                          >
                            {image.originalFilename} 삭제
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="image-library-empty">
                아직 업로드한 이미지가 없습니다.
              </p>
            )}
            <div className="image-library-dialog-actions">
              <button onClick={bridge.close} type="button">
                닫기
              </button>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
