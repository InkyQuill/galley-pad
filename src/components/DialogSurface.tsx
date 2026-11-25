import { useEffect, useId, useRef, type ReactNode } from "react";
import { TbX } from "react-icons/tb";

export function DialogSurface({
  title,
  closeLabel,
  className,
  initialFocus,
  focusFallback,
  onClose,
  children,
}: {
  title: string;
  closeLabel: string;
  className?: string;
  initialFocus?: string;
  focusFallback?: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousFocus = document.activeElement;
    if (!dialog.open && typeof dialog.showModal === "function") dialog.showModal();
    else if (!dialog.open) dialog.setAttribute("open", "");

    const frame = initialFocus
      ? window.requestAnimationFrame(() => dialog.querySelector<HTMLElement>(initialFocus)?.focus())
      : undefined;

    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");

      if (previousFocus instanceof HTMLElement && previousFocus.isConnected && previousFocus !== document.body) {
        previousFocus.focus();
      } else {
        focusFallback?.();
      }
    };
  }, [focusFallback, initialFocus]);

  return (
    <dialog
      ref={dialogRef}
      className={className ? `settings-dialog ${className}` : "settings-dialog"}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
      }}
    >
      <header className="settings-dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" aria-label={closeLabel} onClick={onClose}>
          <TbX size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </header>
      <div className="settings-dialog-body">{children}</div>
    </dialog>
  );
}
