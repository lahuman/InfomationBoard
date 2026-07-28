import { randomInt } from "node:crypto";

const BOARD_SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export const BOARD_SLUG_LENGTH = 12;
export const BOARD_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function generateBoardSlug(): string {
  return Array.from(
    { length: BOARD_SLUG_LENGTH },
    () => BOARD_SLUG_ALPHABET[randomInt(BOARD_SLUG_ALPHABET.length)],
  ).join("");
}

