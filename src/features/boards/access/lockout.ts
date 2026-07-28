import "server-only";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const identitySchema = z.object({
  boardId: z.uuid(),
  visitorHash: z.string().regex(/^[0-9a-f]{64}$/),
});

export async function getPasswordLock(
  boardId: string,
  visitorHash: string,
): Promise<{ lockedUntil: string | null } | null> {
  if (!identitySchema.safeParse({ boardId, visitorHash }).success) return null;
  const { data, error } = await createAdminSupabaseClient().rpc(
    "get_password_lock_for_server",
    { p_board_id: boardId, p_anonymous_key_hash: visitorHash },
  );
  if (error) return null;
  const lockedUntil = z.string().safeParse(data?.[0]?.locked_until);
  return { lockedUntil: lockedUntil.success ? lockedUntil.data : null };
}

export async function recordPasswordFailure(
  boardId: string,
  visitorHash: string,
): Promise<{ failedCount: number; locked: boolean } | null> {
  if (!identitySchema.safeParse({ boardId, visitorHash }).success) return null;
  const { data, error } = await createAdminSupabaseClient().rpc(
    "record_password_failure_for_server",
    { p_board_id: boardId, p_anonymous_key_hash: visitorHash },
  );
  const parsed = z
    .object({
      failed_count: z.number().int().positive(),
      locked_until: z.string().nullable(),
    })
    .safeParse(data?.[0]);
  if (error || !parsed.success) return null;
  return {
    failedCount: parsed.data.failed_count,
    locked: parsed.data.locked_until !== null,
  };
}

export async function clearPasswordFailures(
  boardId: string,
  visitorHash: string,
): Promise<boolean> {
  if (!identitySchema.safeParse({ boardId, visitorHash }).success) return false;
  const { error } = await createAdminSupabaseClient().rpc(
    "clear_password_failures_for_server",
    { p_board_id: boardId, p_anonymous_key_hash: visitorHash },
  );
  return !error;
}
