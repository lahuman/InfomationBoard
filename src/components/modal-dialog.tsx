"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from "react";

const FOCUSABLE = [
  "button:enabled",
  "input:enabled",
  "select:enabled",
  "textarea:enabled",
  "a[href]",
  '[tabindex]:not([tabindex="-1"]):not(:disabled)',
].join(",");

function focusInsideDialog(
  dialog: HTMLElement,
  requestedTarget?: HTMLElement | null,
) {
  const requestedTargetIsUsable =
    requestedTarget?.isConnected &&
    dialog.contains(requestedTarget) &&
    !requestedTarget.matches(":disabled");
  const target =
    (requestedTargetIsUsable ? requestedTarget : null) ??
    dialog.querySelector<HTMLElement>(FOCUSABLE) ??
    dialog;
  target.focus();

  if (!dialog.contains(document.activeElement)) {
    dialog.focus();
  }
}

type ModalDialogProps = {
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  open: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  title: string;
  titleId: string;
};

export function ModalDialog({
  children,
  initialFocusRef,
  onClose,
  open,
  returnFocusRef,
  title,
  titleId,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const latestReturnFocusRef = useRef(returnFocusRef);
  latestReturnFocusRef.current = returnFocusRef;

  useEffect(() => {
    if (!open) {
      return;
    }

    const activeElement = document.activeElement;
    previouslyFocusedRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;

    return () => {
      const returnFocusTarget = latestReturnFocusRef.current?.current;
      if (returnFocusTarget?.isConnected) {
        returnFocusTarget.focus();
        return;
      }

      if (previouslyFocusedRef.current?.isConnected) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (dialog) focusInsideDialog(dialog, initialFocusRef?.current);
  }, [initialFocusRef, open]);

  if (!open) {
    return null;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements.at(-1);

    if (!firstFocusable || !lastFocusable) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    if (event.shiftKey && document.activeElement === firstFocusable) {
      event.preventDefault();
      lastFocusable.focus();
    } else if (!event.shiftKey && document.activeElement === lastFocusable) {
      event.preventDefault();
      firstFocusable.focus();
    }
  }

  function handleBackdropPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" onPointerDown={handleBackdropPointerDown}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="modal-dialog"
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </section>
    </div>
  );
}
