"use client";

import { z } from "zod";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  ACCOUNT_STORAGE_LIMIT_BYTES,
  ACCEPTED_IMAGE_MIME_TYPES,
  BOARD_IMAGE_LIMIT,
  IMAGE_BUCKET,
  IMAGE_FILE_LIMIT_BYTES,
} from "./model";
import {
  cancelBoardImage,
  type CancelBoardImageResult,
} from "./actions/cancel-image";
import {
  finalizeBoardImage,
  type FinalizeBoardImageResult,
} from "./actions/finalize-image";
import {
  reserveBoardImage,
  type ReserveBoardImageResult,
} from "./actions/reserve-image";

const boardIdSchema = z.uuid();

export type UploadBoardImageInput = {
  boardId: string;
  file: File;
  storageBytes: number;
  imageCount: number;
};

export type UploadBoardImageActions = {
  reserveAction: (
    input: Parameters<typeof reserveBoardImage>[0],
  ) => Promise<ReserveBoardImageResult>;
  finalizeAction: (
    input: Parameters<typeof finalizeBoardImage>[0],
  ) => Promise<FinalizeBoardImageResult>;
  cancelAction: (
    input: Parameters<typeof cancelBoardImage>[0],
  ) => Promise<CancelBoardImageResult>;
};

export type UploadBoardImageResult =
  | FinalizeBoardImageResult
  | Extract<ReserveBoardImageResult, { status: "error" }>
  | { status: "error"; message: string };

type BrowserUploadClient = {
  storage: {
    from(bucket: string): {
      uploadToSignedUrl(
        path: string,
        token: string,
        file: File,
        options: { contentType: string; upsert: false },
      ): PromiseLike<{ error: unknown }>;
    };
  };
};

const defaultActions: UploadBoardImageActions = {
  reserveAction: reserveBoardImage,
  finalizeAction: finalizeBoardImage,
  cancelAction: cancelBoardImage,
};

function validationError(
  input: UploadBoardImageInput,
): { status: "error"; message: string } | null {
  if (
    !boardIdSchema.safeParse(input.boardId).success ||
    !input.file ||
    typeof input.file.name !== "string" ||
    typeof input.file.type !== "string" ||
    typeof input.file.size !== "number" ||
    !Number.isInteger(input.storageBytes) ||
    input.storageBytes < 0 ||
    input.storageBytes > ACCOUNT_STORAGE_LIMIT_BYTES ||
    !Number.isInteger(input.imageCount) ||
    input.imageCount < 0
  ) {
    return { status: "error", message: "업로드할 이미지를 확인해 주세요." };
  }
  if (input.file.size < 1) {
    return {
      status: "error",
      message: "비어 있는 파일은 업로드할 수 없습니다.",
    };
  }
  if (input.file.size > IMAGE_FILE_LIMIT_BYTES) {
    return { status: "error", message: "이미지는 10 MB 이하여야 합니다." };
  }
  if (
    !ACCEPTED_IMAGE_MIME_TYPES.includes(
      input.file.type as (typeof ACCEPTED_IMAGE_MIME_TYPES)[number],
    )
  ) {
    return {
      status: "error",
      message: "JPEG, PNG, WebP 또는 GIF 이미지를 선택해 주세요.",
    };
  }
  if (input.imageCount >= BOARD_IMAGE_LIMIT) {
    return {
      status: "error",
      message: "안내판에는 이미지를 최대 20개까지 추가할 수 있습니다.",
    };
  }
  if (
    input.file.size >
    ACCOUNT_STORAGE_LIMIT_BYTES - input.storageBytes
  ) {
    return { status: "error", message: "남은 저장 공간이 부족합니다." };
  }
  return null;
}

export async function uploadBoardImage(
  input: UploadBoardImageInput,
  actions: UploadBoardImageActions = defaultActions,
  createClient: () => BrowserUploadClient = createBrowserSupabaseClient,
): Promise<UploadBoardImageResult> {
  const invalid = validationError(input);
  if (invalid) return invalid;

  const reserved = await actions.reserveAction({
    boardId: input.boardId,
    originalFilename: input.file.name,
    mimeType: input.file.type,
    sizeBytes: input.file.size,
  });
  if (reserved.status !== "reserved") return reserved;

  const supabase = createClient();
  let upload;
  try {
    upload = await supabase.storage
      .from(IMAGE_BUCKET)
      .uploadToSignedUrl(
        reserved.path,
        reserved.token,
        input.file,
        {
          contentType: input.file.type,
          upsert: false,
        },
      );
  } catch {
    upload = { error: true };
  }

  if (upload.error) {
    try {
      await actions.cancelAction({
        boardId: input.boardId,
        attachmentId: reserved.attachmentId,
      });
    } catch {
      // Expired-reservation cleanup remains the fallback.
    }
    return {
      status: "error",
      message: "이미지를 업로드하지 못했습니다. 다시 시도해 주세요.",
    };
  }

  return actions.finalizeAction({
    boardId: input.boardId,
    attachmentId: reserved.attachmentId,
  });
}
