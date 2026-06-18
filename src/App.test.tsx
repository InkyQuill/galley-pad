import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@inky/galley-editor", () => import("./test/galley-editor.mock"));

describe("App", () => {
  it("renders the single-document editor shell with starter Markdown", () => {
    render(<App />);

    expect(screen.getByText("Untitled.md")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(
      screen.getByRole("main", { name: "Markdown document editor" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "# Untitled\n\nStart writing Markdown.\n",
    );
    expect(screen.getByLabelText("Document statistics")).toHaveTextContent(
      "4 words",
    );
  });

  it("updates document statistics when editor content changes", () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "One two three" },
    });

    expect(screen.getByLabelText("Document statistics")).toHaveTextContent(
      "3 words",
    );
  });
});
