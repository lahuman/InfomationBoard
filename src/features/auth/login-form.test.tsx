import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

it("offers magic-link and Google sign-in accessibly", async () => {
  const user = userEvent.setup();
  const magicLink = vi.fn(async () => ({
    status: "success" as const,
    message: "입력한 주소로 로그인 링크를 보냈습니다. 이메일을 확인해 주세요.",
  }));
  const google = vi.fn(async () => undefined);

  render(
    <LoginForm
      next="/dashboard"
      requestMagicLinkAction={magicLink}
      googleAction={google}
    />,
  );

  await user.type(screen.getByLabelText("이메일"), "owner@example.com");
  await user.click(screen.getByRole("button", { name: "매직링크 받기" }));

  expect(magicLink).toHaveBeenCalled();
  expect(
    await screen.findByText(/입력한 주소로 로그인 링크를 보냈습니다/),
  ).toHaveAttribute("role", "status");
  expect(
    screen.getByRole("button", { name: "Google로 계속하기" }),
  ).toBeEnabled();
});
