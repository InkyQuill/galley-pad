import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentView } from "./DocumentView";

vi.mock("@inky/galley-editor", () => ({
  GalleyEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (content: string) => void;
  }) => (
    <textarea
      aria-label="Mock Galley Editor"
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));

describe("DocumentView", () => {
  it("renders the markdown editor region", () => {
    render(<DocumentView content="# Hello" onContentChange={() => undefined} />);

    expect(
      screen.getByRole("main", { name: "Markdown document editor" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue("# Hello");
  });

  it("passes edited content through the stable app callback", () => {
    const onContentChange = vi.fn();
    render(<DocumentView content="Initial" onContentChange={onContentChange} />);

    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "Changed" },
    });

    expect(onContentChange).toHaveBeenCalledTimes(1);
    expect(onContentChange).toHaveBeenCalledWith("Changed");
  });
});
