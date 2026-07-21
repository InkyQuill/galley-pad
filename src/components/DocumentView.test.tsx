import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DocumentView } from "./DocumentView";

vi.mock("@inkyquill/galley-editor", () => import("../test/galley-editor.mock"));
vi.mock("react-dom/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom/server")>();

  return {
    ...actual,
    renderToStaticMarkup: vi.fn(actual.renderToStaticMarkup),
  };
});

function dispatchMiddleButton(target: Element, type: "mousedown" | "auxclick") {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 1,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

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
    expect(
      screen.getByLabelText("Mock table control icon count"),
    ).toHaveTextContent("11");
    expect(vi.mocked(renderToStaticMarkup)).toHaveBeenCalledTimes(11);
    expect(screen.getByLabelText("Mock table control icon 0")).toHaveAttribute(
      "data-title",
      "insertRowBefore first",
    );
    expect(screen.getByLabelText("Mock table control icon 1")).toHaveAttribute(
      "data-title",
      "insertRowBefore second",
    );
    expect(screen.getByLabelText("Mock table control icon 0")).toHaveAttribute(
      "data-class-name",
      expect.stringContaining("galley-table-control-icon"),
    );
    expect(screen.getByLabelText("Mock table control icon 0")).toHaveAttribute(
      "data-distinct",
      "true",
    );
  });

  it("passes theme and status into Galley chrome", () => {
    render(
      <DocumentView
        content="One two"
        onContentChange={() => undefined}
        editorScheme="dark"
        editorStyle={{
          "--ge-color-bg": "#1a1b26",
          "--ge-color-link": "#7aa2f7",
        }}
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
    expect(screen.getByTestId("mock-galley-editor-shell")).toHaveStyle({
      "--ge-color-bg": "#1a1b26",
      "--ge-color-link": "#7aa2f7",
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

  it.each(["mousedown", "auxclick"] as const)(
    "cancels middle-button %s events at the editor boundary",
    (eventType) => {
      const parent = document.createElement("div");
      const onBubble = vi.fn();
      parent.addEventListener(eventType, onBubble);
      const view = render(
        <DocumentView content="Initial" onContentChange={() => undefined} />,
        { container: parent },
      );

      const event = dispatchMiddleButton(
        view.getByLabelText("Mock Galley Editor"),
        eventType,
      );

      expect(event.defaultPrevented).toBe(true);
      expect(onBubble).not.toHaveBeenCalled();
    },
  );

  it("allows left-button events through the editor boundary", () => {
    render(<DocumentView content="Initial" onContentChange={() => undefined} />);
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
    });

    screen.getByLabelText("Mock Galley Editor").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
