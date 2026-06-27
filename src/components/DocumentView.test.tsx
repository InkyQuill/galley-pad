import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentView } from "./DocumentView";
import { getAppearanceTheme } from "../settings/appearance";

vi.mock("@inky/galley-editor", () => import("../test/galley-editor.mock"));

describe("DocumentView", () => {
  it("renders the markdown editor region", () => {
    render(<DocumentView content="# Hello" onContentChange={() => undefined} />);

    expect(
      screen.getByRole("tabpanel", { name: "Markdown document editor" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue("# Hello");
    expect(screen.getByTestId("mock-galley-editor-shell")).toHaveAttribute(
      "data-layout",
      "fill",
    );
    expect(screen.getByTestId("mock-galley-editor-shell")).toHaveAttribute(
      "data-theme",
      "auto",
    );
    expect(screen.getByLabelText("Mock Galley Footer")).toHaveTextContent(
      "Draft",
    );
    expect(
      screen.queryByRole("toolbar", { name: "Mock Galley Toolbar" }),
    ).not.toBeInTheDocument();
  });

  it("links the document panel to its owning tab", () => {
    render(
      <DocumentView
        content="# Hello"
        onContentChange={() => undefined}
        panelId="document-panel-tab-1"
        labelledBy="document-tab-tab-1"
      />,
    );

    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "id",
      "document-panel-tab-1",
    );
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "document-tab-tab-1",
    );
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

  it("passes theme and status into Galley chrome", () => {
    render(
      <DocumentView
        content="One two"
        onContentChange={() => undefined}
        theme={getAppearanceTheme("galley-dark")}
        fontSettings={{ family: "mono", size: "large" }}
        status="Unsaved"
      />,
    );

    expect(screen.getByTestId("mock-galley-editor-shell")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    expect(screen.getByTestId("mock-galley-editor-shell")).toHaveStyle({
      "--ge-font-size": "1.125rem",
    });
    expect(screen.getByTestId("mock-galley-editor-shell").style.getPropertyValue(
      "--ge-font-body",
    )).toContain("ui-monospace");
    expect(screen.getByLabelText("Mock Galley Footer")).toHaveTextContent(
      "Unsaved",
    );
    expect(screen.getByLabelText("Mock Galley Footer")).toHaveTextContent(
      "2 words",
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
