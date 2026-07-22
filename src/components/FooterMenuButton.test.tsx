import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FooterMenuButton } from "./FooterMenuButton";

const labels = [
  "New",
  "Open...",
  "Save",
  "Save As...",
  "Toggle Editor Toolbar",
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

function renderMenu() {
  const onCommand = vi.fn();
  render(<FooterMenuButton onCommand={onCommand} />);

  return {
    onCommand,
    trigger: screen.getByRole("button", { name: "Galley Pad menu" }),
  };
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
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(labels);
    expect(items[0]).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("renders the command-group separator with native semantics", () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);

    const separator = within(screen.getByRole("menu")).getByRole("separator");
    expect(separator.tagName).toBe("HR");
    expect(separator).toHaveClass("footer-menu-separator");
  });

  it("wraps focus with ArrowDown and ArrowUp", () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    const items = within(menu).getAllByRole("menuitem");

    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(items[5]).toHaveFocus();

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(items[0]).toHaveFocus();
  });

  it("moves focus to the first and last items with Home and End", () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    const items = within(menu).getAllByRole("menuitem");

    fireEvent.keyDown(menu, { key: "End" });
    expect(items[5]).toHaveFocus();

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
});
