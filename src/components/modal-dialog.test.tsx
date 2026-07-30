import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { ModalDialog } from "./modal-dialog";

function Harness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} onClick={() => setOpen(true)} type="button">
        열기
      </button>
      <ModalDialog
        initialFocusRef={firstRef}
        onClose={() => setOpen(false)}
        open={open}
        returnFocusRef={triggerRef}
        title="이미지 관리"
        titleId="image-dialog-title"
      >
        <button ref={firstRef} type="button">
          첫 작업
        </button>
        <button type="button">마지막 작업</button>
      </ModalDialog>
    </>
  );
}

describe("ModalDialog", () => {
  it("presents a labelled modal dialog and moves focus to its initial action", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "열기" }));

    const dialog = screen.getByRole("dialog", { name: "이미지 관리" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "image-dialog-title");
    expect(screen.getByRole("heading", { name: "이미지 관리" })).toHaveAttribute(
      "id",
      "image-dialog-title",
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "첫 작업" })).toHaveFocus());
  });

  it("keeps Tab focus within the dialog at both boundaries", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "열기" }));

    const dialog = screen.getByRole("dialog");
    const first = screen.getByRole("button", { name: "첫 작업" });
    const last = screen.getByRole("button", { name: "마지막 작업" });

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "열기" });
    await userEvent.click(trigger);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes only when the backdrop itself receives the pointer event", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "열기" }));

    const dialog = screen.getByRole("dialog");
    fireEvent.pointerDown(dialog);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.pointerDown(dialog.parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
