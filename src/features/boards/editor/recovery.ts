import { z } from "zod";
import { editorDraftSchema } from "../schema";

const RECOVERY_PREFIX = "informationboard:recovery:";

const recoveryCopySchema = z
  .object({
    savedAt: z.iso.datetime(),
    revision: z.number().int().positive(),
    draft: editorDraftSchema,
  })
  .strict();

export type RecoveryCopy = z.infer<typeof recoveryCopySchema>;

function recoveryKey(boardId: string) {
  return `${RECOVERY_PREFIX}${boardId}`;
}

export function saveRecoveryCopy(
  boardId: string,
  copy: RecoveryCopy,
): void {
  const parsed = recoveryCopySchema.safeParse(copy);
  if (!parsed.success) return;
  window.localStorage.setItem(
    recoveryKey(boardId),
    JSON.stringify(parsed.data),
  );
}

export function loadRecoveryCopy(boardId: string): RecoveryCopy | null {
  const key = recoveryKey(boardId);
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = recoveryCopySchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // Invalid recovery JSON is removed below.
  }

  window.localStorage.removeItem(key);
  return null;
}

export function clearRecoveryCopy(boardId: string): void {
  window.localStorage.removeItem(recoveryKey(boardId));
}

