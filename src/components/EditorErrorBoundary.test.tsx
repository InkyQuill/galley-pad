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
