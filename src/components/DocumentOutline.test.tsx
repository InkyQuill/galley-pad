import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentOutline, headingAtPosition, outlinePositionAtViewport } from "./DocumentOutline";

const headings = [
  { from: 5, to: 12, level: 1, text: "Opening", slug: "opening" },
  { from: 20, to: 34, level: 2, text: "Details", slug: "details" },
  { from: 50, to: 65, level: 2, text: "Closing", slug: "closing" },
];

describe("DocumentOutline", () => {
  it("focuses and distinguishes repeated outline entries", () => {
    render(<DocumentOutline id="toc" headings={[headings[1], { ...headings[1], from: 61, slug: "details-2" }]}
      viewportStart={0} onNavigate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", {name: "Details (1 of 2)"})).toHaveFocus();
    expect(screen.getByRole("button", {name: "Details (2 of 2)"})).toBeVisible();
  });

  it("matches source positions to the previous heading", () => {
    expect(headingAtPosition(headings, 4)).toBe(-1);
    expect(headingAtPosition(headings, 20)).toBe(1);
    expect(headingAtPosition(headings, 49)).toBe(1);
    expect(headingAtPosition(headings, 80)).toBe(2);
  });

  it("ignores the preceding blank line after a start-aligned jump", () => {
    const content = "First line\n\n## Details\n\nBody";
    const offsets = [{ from: 12, to: 22, level: 2, text: "Details", slug: "details" }];
    expect(outlinePositionAtViewport(content, offsets, { from: 11, to: 23 })).toBe(12);
    expect(outlinePositionAtViewport(content, offsets, { from: 0, to: 23 })).toBe(0);
  });

  it("marks the visible location and supports keyboard navigation and dismissal", () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    render(
      <DocumentOutline
        id="outline"
        headings={headings}
        viewportStart={20}
        onNavigate={onNavigate}
        onClose={onClose}
      />,
    );
    const details = screen.getByRole("button", { name: "Details" });
    const closing = screen.getByRole("button", { name: "Closing" });
    expect(details).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("button", { name: "Opening" })).toHaveFocus();
    act(() => details.focus());
    expect(details).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(details, { key: "ArrowDown" });
    expect(closing).toHaveFocus();
    fireEvent.click(closing);
    expect(onNavigate).toHaveBeenCalledWith(50);
    fireEvent.keyDown(closing, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
