"use server";

import { revalidatePath } from "next/cache";
import { argon2id, hash } from "argon2";
import { z } from "zod";
import { requireUser } from "@/features/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  publicationInputSchema,
  type PublicationInput,
} from "../schema";

const SAVE_ERROR_MESSAGE =
  "게시 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const CONTENT_ERROR_MESSAGE = "게시하려면 제목과 본문을 입력해 주세요.";
const boardSlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const currentPublicationSchema = z
  .object({
    revision: z.number().int().positive(),
    status: z.enum(["draft", "published"]),
    visibility: z.enum(["private", "public", "password"]),
    allow_indexing: z.boolean(),
    updated_at: z.string(),
  })
  .strict();

export type PublishBoardResult =
  | { status: "saved"; revision: number; updatedAt: string }
  | {
      status: "conflict";
      current: {
        revision: number;
        status: "draft" | "published";
        visibility: "private" | "public" | "password";
        allowIndexing: boolean;
        updatedAt: string;
      };
    }
  | {
      status: "validation_error" | "error";
      message: string;
      fieldErrors?: Record<string, string[] | undefined>;
    };

async function revalidateBoardPaths(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  boardId: string,
  ownerId: string,
  editorPath: string,
) {
  revalidatePath(editorPath);
  revalidatePath("/dashboard");

  try {
    const { data, error } = await supabase
      .from("boards")
      .select("slug")
      .eq("id", boardId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    const slug = boardSlugSchema.safeParse(data?.slug);

    if (!error && slug.success) revalidatePath(`/b/${slug.data}`);
  } catch {
    // The mutation is already durable; a later request can refresh this path.
  }
}

export async function publishBoard(
  input: PublicationInput,
): Promise<PublishBoardResult> {
  const parsed = publicationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "validation_error",
      message: "게시 설정을 확인해 주세요.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const editorPath = `/boards/${parsed.data.id}/edit`;
  const user = await requireUser(editorPath);
  const supabase = await createServerSupabaseClient();

  let mutationResult: {
    data: { revision: number; updated_at: string } | null;
    error: { code?: string } | null;
  };

  try {
    if (parsed.data.mode === "password") {
      const passwordHash = await hash(parsed.data.password, {
        type: argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      });
      const rpcResult = await supabase.rpc(
        "publish_board_with_password",
        {
          p_board_id: parsed.data.id,
          p_revision: parsed.data.revision,
          p_password_hash: passwordHash,
        },
      );

      mutationResult = {
        data: rpcResult.data?.[0] ?? null,
        error: rpcResult.error,
      };
    } else {
      const publication =
        parsed.data.mode === "public"
          ? {
              status: "published",
              visibility: "public",
              allow_indexing: parsed.data.allowIndexing,
            }
          : {
              status: "draft",
              visibility: "private",
              allow_indexing: false,
            };

      mutationResult = await supabase
        .from("boards")
        .update(publication)
        .eq("id", parsed.data.id)
        .eq("owner_id", user.id)
        .eq("revision", parsed.data.revision)
        .select("revision, updated_at")
        .maybeSingle();
    }
  } catch {
    return { status: "error", message: SAVE_ERROR_MESSAGE };
  }

  if (mutationResult.error) {
    if (mutationResult.error.code === "23514") {
      return {
        status: "validation_error",
        message: CONTENT_ERROR_MESSAGE,
      };
    }
    return { status: "error", message: SAVE_ERROR_MESSAGE };
  }

  if (mutationResult.data) {
    await revalidateBoardPaths(
      supabase,
      parsed.data.id,
      user.id,
      editorPath,
    );
    return {
      status: "saved",
      revision: mutationResult.data.revision,
      updatedAt: mutationResult.data.updated_at,
    };
  }

  let currentResult;
  try {
    currentResult = await supabase
      .from("boards")
      .select(
        "revision, status, visibility, allow_indexing, updated_at",
      )
      .eq("id", parsed.data.id)
      .eq("owner_id", user.id)
      .maybeSingle();
  } catch {
    return { status: "error", message: SAVE_ERROR_MESSAGE };
  }

  if (currentResult.error) {
    return { status: "error", message: SAVE_ERROR_MESSAGE };
  }

  const current = currentPublicationSchema.safeParse(currentResult.data);
  if (!current.success) {
    return { status: "error", message: "안내판을 찾을 수 없습니다." };
  }

  return {
    status: "conflict",
    current: {
      revision: current.data.revision,
      status: current.data.status,
      visibility: current.data.visibility,
      allowIndexing: current.data.allow_indexing,
      updatedAt: current.data.updated_at,
    },
  };
}
