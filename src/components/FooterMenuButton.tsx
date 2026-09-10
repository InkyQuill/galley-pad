import { useEffect, useId, useRef, useState } from "react";
import { TbCheck, TbMenu2 } from "react-icons/tb";

import type { AppMenuCommand } from "../tauri/menuEvents";

const MENU_ITEMS = [
  { label: "New", command: "new" },
  { label: "Open...", command: "open" },
  { label: "Save", command: "save" },
  { label: "Save As...", command: "save-as" },
  {
    label: "Toggle Editor Toolbar",
    command: "toggle-toolbar",
    section: "View",
  },
  {
    label: "Word Wrap",
    command: "toggle-word-wrap",
    shortcut: "Alt+Z",
  },
  { label: "Settings...", command: "settings" },
] as const satisfies ReadonlyArray<{
  label: string;
  command: AppMenuCommand;
  section?: string;
  shortcut?: string;
}>;

type FooterMenuButtonProps = {
  wordWrap: boolean;
  onCommand(command: AppMenuCommand): void;
};

export function FooterMenuButton({
  wordWrap,
  onCommand,
}: FooterMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (open) {
      itemButtonRefs.current[0]?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !wrapperRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = itemButtonRefs.current.findIndex(
      (button) => button === document.activeElement,
    );
    let nextIndex: number | undefined;

    switch (event.key) {
      case "ArrowDown":
        nextIndex = (currentIndex + 1) % MENU_ITEMS.length;
        break;
      case "ArrowUp":
        nextIndex =
          (currentIndex - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = MENU_ITEMS.length - 1;
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      default:
        return;
    }

    event.preventDefault();
    itemButtonRefs.current[nextIndex]?.focus();
  };

  const selectCommand = (command: AppMenuCommand) => {
    setOpen(false);
    onCommand(command);
  };

  return (
    <div className="footer-menu" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className="footer-menu-trigger"
        aria-label="Galley Pad menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <TbMenu2 aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={menuId}
          className="footer-menu-popover"
          role="menu"
          onKeyDown={handleMenuKeyDown}
        >
          {MENU_ITEMS.map((item, index) => (
            <div key={item.command}>
              {"section" in item ? (
                <>
                  <hr className="footer-menu-separator" />
                  <div className="footer-menu-heading">{item.section}</div>
                </>
              ) : item.command === "settings" ? (
                <hr className="footer-menu-separator" />
              ) : null}
              <button
                ref={(button) => {
                  itemButtonRefs.current[index] = button;
                }}
                type="button"
                className="footer-menu-item"
                role={
                  item.command === "toggle-word-wrap"
                    ? "menuitemcheckbox"
                    : "menuitem"
                }
                aria-checked={
                  item.command === "toggle-word-wrap" ? wordWrap : undefined
                }
                onClick={() => selectCommand(item.command)}
              >
                {item.command === "toggle-word-wrap" ? (
                  <span className="footer-menu-check" aria-hidden="true">
                    {wordWrap ? <TbCheck /> : null}
                  </span>
                ) : null}
                <span className="footer-menu-item-label">{item.label}</span>
                {"shortcut" in item ? (
                  <kbd className="footer-menu-shortcut">{item.shortcut}</kbd>
                ) : null}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
