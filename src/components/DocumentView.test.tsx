import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentView } from "./DocumentView";

vi.mock("@inky/galley-editor", () => import("../test/galley-editor.mock"));

describe("DocumentView", () => {
  it("renders the markdown editor region", () => {
    render(<DocumentView content="# Hello" onContentChange={() => undefined} />);

    expect(
      screen.getByRole("main", { name: "Markdown document editor" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue("# Hello");
    expect(
      screen.queryByRole("toolbar", { name: "Mock Galley Toolbar" }),
    ).not.toBeInTheDocument();
  });

  it("renders the Galley toolbar with icon overrides when requested", () => {
    render(
      <DocumentView
        content="# Hello"
        onContentChange={() => undefined}
        toolbarVisible={true}
      />,
    );

    expect(
      screen.getByRole("toolbar", { name: "Mock Galley Toolbar" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mock toolbar icon count")).toHaveTextContent(
      "15",
    );
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
