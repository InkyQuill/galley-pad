import { useEffect, useRef, type KeyboardEvent } from "react";

type TabAction = {
  label: string;
  run: () => void;
  disabled?: boolean;
};

export function TabActionsMenu({
  x,
  y,
  actions,
  onDismiss,
}: {
  x: number;
  y: number;
  actions: readonly TabAction[];
  onDismiss: (restoreFocus: boolean) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = menu.current;
    if (!element) return;
    element.style.left = `${Math.max(0, Math.min(x, window.innerWidth - element.offsetWidth))}px`;
    element.style.top = `${Math.max(0, Math.min(y, window.innerHeight - element.offsetHeight))}px`;
    element.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();

    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !element.contains(event.target)) onDismiss(false);
    };
    window.addEventListener("pointerdown", dismiss);
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [x, y, onDismiss]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onDismiss(true);
      return;
    }

    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const index = items.findIndex((item) => item === document.activeElement);
    let next: number;
    switch (event.key) {
      case "ArrowDown": next = (index + 1) % items.length; break;
      case "ArrowUp": next = (index - 1 + items.length) % items.length; break;
      case "Home": next = 0; break;
      case "End": next = items.length - 1; break;
      default: return;
    }

    event.preventDefault();
    items[next]?.focus();
  }

  return (
    <div
      ref={menu}
      className="tab-actions-menu"
      role="menu"
      aria-label="Tab actions"
      onKeyDown={handleKeyDown}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          disabled={action.disabled}
          onClick={() => {
            onDismiss(false);
            action.run();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
