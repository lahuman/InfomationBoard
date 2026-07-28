import { expect, it } from "vitest";
import { diagnosticUrl } from "../../../tests/e2e/support/live-diagnostics";

it("removes query secrets from live E2E diagnostic URLs", () => {
  expect(
    diagnosticUrl(
      "http://localhost:3000/auth/confirm?token_hash=secret-token&type=email",
    ),
  ).toBe("http://localhost:3000/auth/confirm");
  expect(
    diagnosticUrl("/dashboard?code=secret-code", "http://localhost:3000"),
  ).toBe("http://localhost:3000/dashboard");
});
