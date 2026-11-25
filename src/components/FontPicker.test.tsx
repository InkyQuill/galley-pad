import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FontPicker } from "./FontPicker";

it("navigates a large font catalog without rendering every font preview", () => {
  const fonts = Array.from({ length: 250 }, (_, index) => ({
    family: `Font ${index}`,
    cssValue: "sans-serif",
    monospaced: false,
  }));
  const onChange = vi.fn();
  render(<FontPicker value="system" fonts={fonts} previewText="Sample" onChange={onChange} />);
  const trigger = screen.getByRole("button", { name: /System default/ });
  fireEvent.click(trigger);

  const search = screen.getByRole("combobox", { name: "Search fonts" });
  expect(screen.getAllByRole("option").length).toBeLessThan(20);
  fireEvent.keyDown(search, { key: "ArrowUp" });
  const last = screen.getByRole("option", { name: "Font 249" });
  expect(search).toHaveAttribute("aria-activedescendant", last.id);
  expect(last).toHaveAttribute("aria-setsize", "251");
  fireEvent.keyDown(search, { key: "Enter" });
  expect(onChange).toHaveBeenCalledWith("Font 249");
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});
