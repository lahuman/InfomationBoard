const ACCOUNT_STORAGE_LIMIT_BYTES = 50 * 1_048_576;

export function parseExactStorageMeterBytes(value: string | null): number {
  const normalized = value?.trim() ?? "";
  if (!/^(?:0|[1-9]\d*)$/.test(normalized)) {
    throw new Error("Invalid image storage meter value");
  }

  const bytes = Number(normalized);
  if (!Number.isSafeInteger(bytes) || bytes > ACCOUNT_STORAGE_LIMIT_BYTES) {
    throw new Error("Invalid image storage meter value");
  }
  return bytes;
}
