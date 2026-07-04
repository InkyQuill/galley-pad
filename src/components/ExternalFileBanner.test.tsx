import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExternalFileBanner } from "./ExternalFileBanner";

describe("ExternalFileBanner", () => {
  it("shows external update warning without rendering diffs", () => {
    const reconcile = vi.fn();
    render(
      <ExternalFileBanner
        kind="clean-update"
        displayName="notes.md"
        onReload={vi.fn()}
        onFollow={vi.fn()}
        onKeepAsking={vi.fn()}
        onReconcile={reconcile}
      />,
    );

    const banner = screen.getByRole("status", { name: "External file update" });
    expect(banner).toHaveTextContent("notes.md changed outside Galley Pad.");
    expect(
      screen.queryByRole("region", { name: /changes/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reconcile" }));
    expect(reconcile).toHaveBeenCalledOnce();
  });

  it("shows conflict warning actions without rendering diffs", () => {
    const saveAs = vi.fn();
    render(
      <ExternalFileBanner
        kind="conflict"
        displayName="draft.md"
        onReload={vi.fn()}
        onKeepEditing={vi.fn()}
        onSaveAs={saveAs}
        onReconcile={vi.fn()}
      />,
    );

    const banner = screen.getByRole("status", {
      name: "External file conflict",
    });
    expect(banner).toHaveTextContent(
      "draft.md changed outside Galley Pad while you have unsaved edits.",
    );
    expect(
      screen.queryByRole("region", { name: /changes/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save my changes as" }));
    expect(saveAs).toHaveBeenCalledOnce();
  });

  it("shows deleted file warning", () => {
    render(
      <ExternalFileBanner
        kind="deleted"
        displayName="gone.md"
        onSaveAs={vi.fn()}
        onKeepEditing={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("status", { name: "External file deletion" }),
    ).toHaveTextContent("gone.md was deleted on disk.");
  });
});
