const BOARD_URL_BASE = "https://informationboard.invalid";
const SAFE_BOARD_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function sanitizeBoardUrl(input: string): string {
  const value = input.trim();
  if (!value) return "";

  try {
    const parsed = new URL(value, BOARD_URL_BASE);
    return SAFE_BOARD_PROTOCOLS.has(parsed.protocol) ? value : "";
  } catch {
    return "";
  }
}

export function sanitizeBoardImageUrl(input: string): string {
  const value = input.trim();
  if (
    /^\/b\/[a-z0-9]+(?:-[a-z0-9]+)*\/images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  ) {
    return value;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? value
      : "";
  } catch {
    return "";
  }
}

export function isExternalBoardUrl(input: string): boolean {
  const value = sanitizeBoardUrl(input);
  if (!value) return false;

  try {
    const parsed = new URL(value, BOARD_URL_BASE);
    const base = new URL(BOARD_URL_BASE);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      parsed.origin !== base.origin
    );
  } catch {
    return false;
  }
}
