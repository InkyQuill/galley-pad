import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FooterMenuButton } from "./FooterMenuButton";

const labels = [
  "New",
  "Open...",
  "Save",
  "Save As...",
  "Toggle Editor Toolbar",
  "Word WrapAlt+Z",
  "Settings...",
];

const commands = [
  ["New", "new"],
  ["Open...", "open"],
  ["Save", "save"],
  ["Save As...", "save-as"],
  ["Toggle Editor Toolbar", "toggle-toolbar"],
  ["Settings...", "settings"],
] as const;

function renderMenu(wordWrap = true) {
  const onCommand = vi.fn();
  render(<FooterMenuButton wordWrap={wordWrap} onCommand={onCommand} />);

  return {
    onCommand,
    trigger: screen.getByRole("button", { name: "Galley Pad menu" }),
  };
}

function getMenuItems(menu: HTMLElement): HTMLElement[] {
  return Array.from(
    menu.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemcheckbox"]',
    ),
  );
}

describe("FooterMenuButton", () => {
  it("renders a collapsed menu trigger", () => {
    const { trigger } = renderMenu();

    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens the menu, focuses New, and lists commands in order", () => {
    const { trigger } = renderMenu();

    fireEvent.click(trigger);

    const menu = screen.getByRole("menu");
    const items = getMenuItems(menu);
    expect(items.map((item) => item.textContent)).toEqual(labels);
    expect(items[0]).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("renders the command-group separator with native semantics", () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);

    const separators = within(screen.getByRole("menu")).getAllByRole("separator");
    expect(separators).toHaveLength(2);
    for (const separator of separators) {
      expect(separator.tagName).toBe("HR");
      expect(separator).toHaveClass("footer-menu-separator");
    }
  });

  it("wraps focus with ArrowDown and ArrowUp", () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    const items = getMenuItems(menu);

    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(items[6]).toHaveFocus();

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(items[0]).toHaveFocus();
  });

  it("moves focus to the first and last items with Home and End", () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    const items = getMenuItems(menu);

    fireEvent.keyDown(menu, { key: "End" });
    expect(items[6]).toHaveFocus();

    fireEvent.keyDown(menu, { key: "Home" });
    expect(items[0]).toHaveFocus();
  });

  it("closes on Escape and returns focus to the trigger", () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on pointerdown outside the menu", () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it.each(commands)("emits %s as %s and closes", (label, command) => {
    const { onCommand, trigger } = renderMenu();
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole("menuitem", { name: label }));

    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand).toHaveBeenCalledWith(command);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it.each([true, false])(
    "shows Word Wrap under View with its current checked state %s",
    (wordWrap) => {
      const { trigger } = renderMenu(wordWrap);
      fireEvent.click(trigger);

      const menu = screen.getByRole("menu");
      expect(within(menu).getByText("View")).toBeVisible();
      const wordWrapItem = within(menu).getByRole("menuitemcheckbox", {
        name: /Word Wrap.*Alt\+Z/,
      });
      expect(wordWrapItem).toHaveAttribute("aria-checked", String(wordWrap));
      expect(within(wordWrapItem).getByText("Alt+Z")).toBeVisible();
    },
  );

  it("routes the Word Wrap checkbox through the app menu callback", () => {
    const { onCommand, trigger } = renderMenu(false);
    fireEvent.click(trigger);

    fireEvent.click(
      screen.getByRole("menuitemcheckbox", {
        name: /Word Wrap.*Alt\+Z/,
      }),
    );

    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand).toHaveBeenCalledWith("toggle-word-wrap");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
