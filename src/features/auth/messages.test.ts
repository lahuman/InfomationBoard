import { expect, it } from "vitest";
import { authErrorMessage } from "./messages";

it("does not expose provider errors", () => {
  expect(authErrorMessage("rate_limit", "sensitive provider details")).toBe(
    "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
  );
  expect(authErrorMessage("unknown", "sensitive provider details")).not.toContain(
    "sensitive",
  );
});
