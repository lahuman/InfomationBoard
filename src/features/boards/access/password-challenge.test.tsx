import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordChallenge } from "./password-challenge";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => vi.clearAllMocks());

describe("PasswordChallenge", () => {
  it("submits the transient password and refreshes after unlock", async () => {
    const action = vi.fn(async () => ({ status: "unlocked" as const }));
    render(<PasswordChallenge slug="locked-board" verifyAction={action} />);

    const password = screen.getByLabelText("안내판 비밀번호");
    fireEvent.change(password, { target: { value: "visitor-pass" } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("form", { name: "비밀번호 확인" }));
    });

    expect(action).toHaveBeenCalledWith({
      slug: "locked-board",
      password: "visitor-pass",
    });
    expect(password).toHaveValue("");
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("shows the same safe action message and clears a rejected password", async () => {
    const action = vi.fn(async () => ({
      status: "invalid" as const,
      message: "비밀번호를 확인해 주세요.",
    }));
    render(<PasswordChallenge slug="locked-board" verifyAction={action} />);

    const password = screen.getByLabelText("안내판 비밀번호");
    fireEvent.change(password, { target: { value: "wrong-pass" } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("form", { name: "비밀번호 확인" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "비밀번호를 확인해 주세요.",
    );
    expect(password).toHaveValue("");
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
