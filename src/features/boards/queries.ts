import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type DashboardBoard = {
  id: string;
  title: string;
  template: string;
  status: string;
  revision: number;
  updatedAt: string;
};

export type DashboardData = {
  storageBytes: number;
  boards: DashboardBoard[];
};

export class DashboardDataError extends Error {
  constructor() {
    super("대시보드 데이터를 불러오지 못했습니다.");
    this.name = "DashboardDataError";
  }
}

export async function getDashboardData(
  ownerId: string,
): Promise<DashboardData> {
  const supabase = await createServerSupabaseClient();

  const [profileResult, boardsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("storage_bytes")
      .eq("id", ownerId)
      .single(),
    supabase
      .from("boards")
      .select("id, title, template, status, revision, updated_at")
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false }),
  ]);

  if (
    profileResult.error ||
    !profileResult.data ||
    boardsResult.error
  ) {
    throw new DashboardDataError();
  }

  return {
    storageBytes: profileResult.data.storage_bytes,
    boards: (boardsResult.data ?? []).map((board) => ({
      id: board.id,
      title: board.title,
      template: board.template,
      status: board.status,
      revision: board.revision,
      updatedAt: board.updated_at,
    })),
  };
}

