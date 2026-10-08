import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { EditorErrorBoundary } from "./EditorErrorBoundary";

it("retains recoverable content and retries a failed editor without reloading App", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  let fail = true;
  function Editor() {
    if (fail) throw new Error("Editor initialization failed");
    return <p>Editor ready</p>;
  }
  try {
    const { rerender } = render(<EditorErrorBoundary content="unsaved draft"><Editor /></EditorErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent("Editor initialization failed");
    expect(screen.getByRole("textbox")).toHaveValue("unsaved draft");
    rerender(<EditorErrorBoundary content="another tab"><Editor /></EditorErrorBoundary>);
    expect(screen.getByRole("textbox")).toHaveValue("another tab");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry editor" }));
    expect(screen.getByText("Editor ready")).toBeInTheDocument();
  } finally { log.mockRestore(); }
});

it("recovers automatically when another document is selected", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  function Editor({ fail }: { fail: boolean }) {
    if (fail) throw new Error("Broken document");
    return <p>Other document ready</p>;
  }
  try {
    const { rerender } = render(
      <EditorErrorBoundary content="broken" documentKey="a"><Editor fail /></EditorErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rerender(
      <EditorErrorBoundary content="healthy" documentKey="b"><Editor fail={false} /></EditorErrorBoundary>,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Other document ready")).toBeInTheDocument();
  } finally { log.mockRestore(); }
});

it("does not remount a healthy editor when switching documents", () => {
  const { rerender } = render(
    <EditorErrorBoundary content="first" documentKey="a"><input defaultValue="selection state" /></EditorErrorBoundary>,
  );
  const editor = screen.getByRole("textbox");
  rerender(
    <EditorErrorBoundary content="second" documentKey="b"><input defaultValue="other state" /></EditorErrorBoundary>,
  );
  expect(screen.getByRole("textbox")).toBe(editor);
  expect(editor).toHaveValue("selection state");
});
