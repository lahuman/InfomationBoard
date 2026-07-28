"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/features/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createBoardInputSchema } from "../schema";
import { generateBoardSlug } from "../slug";
import { getBoardTemplate } from "../templates";

const MAX_SLUG_ATTEMPTS = 3;
const CREATE_ERROR_MESSAGE =
  "안내판을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";

export type CreateBoardActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: {
    template?: string[];
  };
};

export async function createBoard(
  _previous: CreateBoardActionState,
  formData: FormData,
): Promise<CreateBoardActionState> {
  const parsed = createBoardInputSchema.safeParse({
    template: String(formData.get("template") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: {
        template: ["안내판 유형을 선택해 주세요."],
      },
    };
  }

  const user = await requireUser("/boards/new");
  const supabase = await createServerSupabaseClient();
  const definition = getBoardTemplate(parsed.data.template);

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    let result: {
      data: { id: string } | null;
      error: { code?: string } | null;
    };

    try {
      result = await supabase
        .from("boards")
        .insert({
          owner_id: user.id,
          slug: generateBoardSlug(),
          title: definition.defaults.title,
          summary: definition.defaults.summary,
          content_markdown: definition.defaults.contentMarkdown,
          template: definition.id,
          theme: definition.defaults.theme,
          visibility: "private",
          status: "draft",
        })
        .select("id")
        .single();
    } catch {
      return {
        status: "error",
        message: CREATE_ERROR_MESSAGE,
      };
    }

    if (!result.error && result.data) {
      redirect(`/boards/${result.data.id}/edit`);
    }

    if (result.error?.code !== "23505") {
      return {
        status: "error",
        message: CREATE_ERROR_MESSAGE,
      };
    }
  }

  return {
    status: "error",
    message: CREATE_ERROR_MESSAGE,
  };
}

