import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockGalleyOpenSearch } from "../test/galley-editor.mock";
import { DocumentView, type DocumentViewHandle } from "./DocumentView";

const runtimePlatform = vi.hoisted(() => ({ isLinuxDesktop: false }));

vi.mock("@inkyquill/galley-editor", () => import("../test/galley-editor.mock"));
vi.mock("../appInfo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../appInfo")>();

  return {
    ...actual,
    get IS_LINUX_DESKTOP() {
      return runtimePlatform.isLinuxDesktop;
    },
  };
});
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
  beforeEach(() => {
    runtimePlatform.isLinuxDesktop = false;
    mockGalleyOpenSearch.mockClear();
  });

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

  it("wraps lines by default and enables horizontal scrolling on request", () => {
    const { rerender } = render(
      <DocumentView content="Long line" onContentChange={() => undefined} />,
    );

    expect(screen.getByTestId("mock-galley-editor-shell")).toHaveAttribute(
      "data-horizontal-scroll",
      "false",
    );

    rerender(
      <DocumentView
        content="Long line"
        onContentChange={() => undefined}
        wordWrap={false}
      />,
    );

    expect(screen.getByTestId("mock-galley-editor-shell")).toHaveAttribute(
      "data-horizontal-scroll",
      "true",
    );
  });

  it("opens Galley search through the DocumentView handle", () => {
    const ref = createRef<DocumentViewHandle>();
    render(
      <DocumentView
        ref={ref}
        content="Find me"
        onContentChange={() => undefined}
      />,
    );

    expect(ref.current?.openSearch()).toBe(true);
    expect(mockGalleyOpenSearch).toHaveBeenCalledOnce();
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

  it.each(["mousedown", "auxclick"] as const)(
    "allows left-button %s events through the editor boundary",
    (eventType) => {
      const parent = document.createElement("div");
      const onBubble = vi.fn();
      parent.addEventListener(eventType, onBubble);
      const view = render(
        <DocumentView content="Initial" onContentChange={() => undefined} />,
        { container: parent },
      );
      const event = new MouseEvent(eventType, {
        bubbles: true,
        button: 0,
        cancelable: true,
      });

      view.getByLabelText("Mock Galley Editor").dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(onBubble).toHaveBeenCalledTimes(1);
    },
  );

  it("renders and dispatches footer menu commands on Linux", () => {
    runtimePlatform.isLinuxDesktop = true;
    const onMenuCommand = vi.fn();
    render(
      <DocumentView
        content="Initial"
        onContentChange={() => undefined}
        onMenuCommand={onMenuCommand}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Galley Pad menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New" }));

    expect(onMenuCommand).toHaveBeenCalledTimes(1);
    expect(onMenuCommand).toHaveBeenCalledWith("new");
  });

  it("routes the Linux footer Word Wrap checkbox through the app toggle pipeline", () => {
    runtimePlatform.isLinuxDesktop = true;
    const onMenuCommand = vi.fn();
    render(
      <DocumentView
        content="Initial"
        onContentChange={() => undefined}
        onMenuCommand={onMenuCommand}
        wordWrap={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Galley Pad menu" }));
    const wordWrapItem = screen.getByRole("menuitemcheckbox", {
      name: /Word Wrap.*Alt\+Z/,
    });
    expect(wordWrapItem).toHaveAttribute("aria-checked", "false");

    fireEvent.click(wordWrapItem);

    expect(onMenuCommand).toHaveBeenCalledOnce();
    expect(onMenuCommand).toHaveBeenCalledWith("toggle-word-wrap");
  });

  it("hides the footer menu on Linux when its callback is missing", () => {
    runtimePlatform.isLinuxDesktop = true;
    render(<DocumentView content="Initial" onContentChange={() => undefined} />);

    expect(
      screen.queryByRole("button", { name: "Galley Pad menu" }),
    ).not.toBeInTheDocument();
  });

  it("hides the footer menu off Linux when its callback is present", () => {
    runtimePlatform.isLinuxDesktop = false;
    render(
      <DocumentView
        content="Initial"
        onContentChange={() => undefined}
        onMenuCommand={() => undefined}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Galley Pad menu" }),
    ).not.toBeInTheDocument();
  });
});
