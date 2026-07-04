import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExternalReconcileView } from "./ExternalReconcileView";

describe("ExternalReconcileView", () => {
  it("shows current and incoming content side by side with highlighted changed rows", () => {
    render(
      <ExternalReconcileView
        title="notes.md"
        currentLabel="Current in Galley Pad"
        incomingLabel="Incoming from disk"
        currentContent="Base\nLocal\n"
        incomingContent="Base\nExternal\n"
        onClose={vi.fn()}
        onReload={vi.fn()}
        onSaveAs={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Current in Galley Pad" }),
    ).toHaveTextContent("Local");
    expect(
      screen.getByRole("region", { name: "Incoming from disk" }),
    ).toHaveTextContent("External");
    expect(screen.getAllByTestId("diff-row-changed")).toHaveLength(2);
  });

  it("calls actions from the reconcile toolbar", () => {
    const onReload = vi.fn();
    const onSaveAs = vi.fn();
    const onClose = vi.fn();
    render(
      <ExternalReconcileView
        title="notes.md"
        currentLabel="Current"
        incomingLabel="Incoming"
        currentContent="Local\n"
        incomingContent="Incoming\n"
        onClose={onClose}
        onReload={onReload}
        onSaveAs={onSaveAs}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Back to editor" }));
    fireEvent.click(screen.getByRole("button", { name: "Reload from disk" }));
    fireEvent.click(screen.getByRole("button", { name: "Save my changes as" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onReload).toHaveBeenCalledOnce();
    expect(onSaveAs).toHaveBeenCalledOnce();
  });

  it("syncs scroll positions between panes", () => {
    render(
      <ExternalReconcileView
        title="notes.md"
        currentLabel="Current"
        incomingLabel="Incoming"
        currentContent="A\nB\nC\n"
        incomingContent="A\nX\nC\n"
        onClose={vi.fn()}
        onReload={vi.fn()}
        onSaveAs={vi.fn()}
      />,
    );

    const currentScroller = screen.getByTestId("diff-pane-left");
    const incomingScroller = screen.getByTestId("diff-pane-right");
    currentScroller.scrollTop = 80;
    currentScroller.scrollLeft = 12;
    fireEvent.scroll(currentScroller);

    expect(incomingScroller.scrollTop).toBe(80);
    expect(incomingScroller.scrollLeft).toBe(12);
  });
});
