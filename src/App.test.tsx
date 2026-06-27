import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  getPendingMarkdownFileOpens,
  getWindowMarkdownFileOpen,
  listenForMarkdownFileOpen,
} from "./tauri/externalFiles";
import {
  listenForAppMenuCommand,
  type AppMenuCommand,
} from "./tauri/menuEvents";
import { pickOpenFile, pickSaveFile } from "./tauri/dialogs";
import { readTextFile, writeTextFile } from "./tauri/files";
import { openMarkdownFileWindow } from "./tauri/windows";

vi.mock("@inky/galley-editor", () => import("./test/galley-editor.mock"));
vi.mock("./tauri/dialogs", () => ({
  pickOpenFile: vi.fn(),
  pickSaveFile: vi.fn(),
}));
vi.mock("./tauri/files", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));
vi.mock("./tauri/externalFiles", () => ({
  getPendingMarkdownFileOpens: vi.fn(),
  getWindowMarkdownFileOpen: vi.fn(() =>
    new URLSearchParams(window.location.search).get("open"),
  ),
  listenForMarkdownFileOpen: vi.fn(),
}));
vi.mock("./tauri/menuEvents", () => ({
  listenForAppMenuCommand: vi.fn(),
}));
vi.mock("./tauri/windows", () => ({
  openMarkdownFileWindow: vi.fn(),
}));

const pickOpenFileMock = vi.mocked(pickOpenFile);
const pickSaveFileMock = vi.mocked(pickSaveFile);
const readTextFileMock = vi.mocked(readTextFile);
const writeTextFileMock = vi.mocked(writeTextFile);
const getPendingMarkdownFileOpensMock = vi.mocked(getPendingMarkdownFileOpens);
const getWindowMarkdownFileOpenMock = vi.mocked(getWindowMarkdownFileOpen);
const listenForMarkdownFileOpenMock = vi.mocked(listenForMarkdownFileOpen);
const listenForAppMenuCommandMock = vi.mocked(listenForAppMenuCommand);
const openMarkdownFileWindowMock = vi.mocked(openMarkdownFileWindow);

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    document.title = "";
    getPendingMarkdownFileOpensMock.mockResolvedValue([]);
    getWindowMarkdownFileOpenMock.mockImplementation(() =>
      new URLSearchParams(window.location.search).get("open"),
    );
    listenForMarkdownFileOpenMock.mockResolvedValue(() => undefined);
    listenForAppMenuCommandMock.mockResolvedValue(() => undefined);
    openMarkdownFileWindowMock.mockResolvedValue("markdown-file-1");
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("renders the tabbed editor shell without the temporary file command toolbar", () => {
    const { container } = render(<App />);

    expect(
      screen.queryByRole("toolbar", { name: "File commands" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Open documents" })).toBeInTheDocument();
    const activeTab = screen.getByRole("tab", { name: "Untitled.md" });
    expect(activeTab).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(activeTab).toHaveAttribute("aria-controls");
    expect(
      screen.getByRole("tabpanel", { name: "Untitled.md" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tabpanel", { name: "Untitled.md" })).toHaveAttribute(
      "id",
      activeTab.getAttribute("aria-controls"),
    );
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "# Untitled\n\nStart writing Markdown.\n",
    );
    expect(screen.getByLabelText("Document statistics")).toHaveTextContent(
      "4 words",
    );
    expect(document.title).toBe("Untitled.md - Galley Pad");

    const appShell = container.querySelector(".app-shell");
    expect(appShell?.children.item(1)).toHaveClass("tabstrip");
    expect(appShell?.children.item(2)).toHaveClass("command-error-slot");
    expect(appShell?.children.item(3)).toHaveClass("document-view");
    expect(
      screen.queryByRole("alert", { name: "File command error" }),
    ).not.toBeInTheDocument();
  });

  it("marks the session dirty when editor content changes and updates the title", () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "One two three" },
    });

    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    expect(screen.getByLabelText("Document statistics")).toHaveTextContent(
      "3 words",
    );
    expect(document.title).toBe("* Untitled.md - Galley Pad");
  });

  it("creates a new tab without replacing the dirty active tab", () => {
    let menuHandler: ((command: AppMenuCommand) => void) | null = null;
    listenForAppMenuCommandMock.mockImplementation(async (handler) => {
      menuHandler = handler;
      return () => undefined;
    });
    render(<App />);
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "Dirty draft" },
    });

    act(() => {
      menuHandler?.("new");
    });

    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getAllByRole("tab", { name: /Untitled\.md/ })).toHaveLength(2);
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "# Untitled\n\nStart writing Markdown.\n",
    );
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("requires confirmation before closing a dirty tab", () => {
    let menuHandler: ((command: AppMenuCommand) => void) | null = null;
    listenForAppMenuCommandMock.mockImplementation(async (handler) => {
      menuHandler = handler;
      return () => undefined;
    });
    render(<App />);
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "Dirty draft" },
    });
    act(() => {
      menuHandler?.("new");
    });

    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Close Untitled.md" }));

    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "Dirty draft",
    );
    expect(screen.getAllByRole("tab", { name: /Untitled\.md/ })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Close Untitled.md" }));
    expect(window.confirm).toHaveBeenCalledWith(
      "Discard unsaved changes to Untitled.md?",
    );
  });

  it("opens a selected file and updates the session", async () => {
    let menuHandler: ((command: AppMenuCommand) => void) | null = null;
    listenForAppMenuCommandMock.mockImplementation(async (handler) => {
      menuHandler = handler;
      return () => undefined;
    });
    pickOpenFileMock.mockResolvedValue("/tmp/opened.md");
    readTextFileMock.mockResolvedValue({
      path: "/tmp/opened.md",
      content: "# Opened\n",
      lineEnding: "lf",
      lastModifiedAt: 10,
    });
    render(<App />);

    await waitFor(() => {
      expect(listenForAppMenuCommandMock).toHaveBeenCalled();
    });
    act(() => {
      menuHandler?.("open");
    });

    await waitFor(() => {
      expect(document.title).toBe("opened.md - Galley Pad");
    });
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue("# Opened\n");
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "opened.md" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(document.title).toBe("opened.md - Galley Pad");
  });

  it("switches between open tabs without losing editor content", async () => {
    let menuHandler: ((command: AppMenuCommand) => void) | null = null;
    listenForAppMenuCommandMock.mockImplementation(async (handler) => {
      menuHandler = handler;
      return () => undefined;
    });
    pickOpenFileMock.mockResolvedValue("/tmp/opened.md");
    readTextFileMock.mockResolvedValue({
      path: "/tmp/opened.md",
      content: "# Opened\n",
      lineEnding: "lf",
      lastModifiedAt: 10,
    });
    render(<App />);
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "Untitled draft" },
    });

    await waitFor(() => {
      expect(listenForAppMenuCommandMock).toHaveBeenCalled();
    });
    act(() => {
      menuHandler?.("open");
    });
    await waitFor(() => {
      expect(document.title).toBe("opened.md - Galley Pad");
    });

    fireEvent.click(screen.getAllByRole("tab", { name: /Untitled\.md/ })[0]);

    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "Untitled draft",
    );
    expect(document.title).toBe("* Untitled.md - Galley Pad");
  });

  it("opens settings from the native menu and persists the open mode", async () => {
    let menuHandler: ((command: AppMenuCommand) => void) | null = null;
    listenForAppMenuCommandMock.mockImplementation(async (handler) => {
      menuHandler = handler;
      return () => undefined;
    });
    render(<App />);

    await waitFor(() => {
      expect(listenForAppMenuCommandMock).toHaveBeenCalled();
    });
    act(() => {
      menuHandler?.("settings");
    });
    await screen.findByRole("dialog", { name: "Settings" });
    fireEvent.click(screen.getByRole("radio", { name: "Separate windows" }));

    expect(localStorage.getItem("galley-pad.openMode")).toBe("windows");
    expect(
      screen.getByRole("radio", { name: "Separate windows" }),
    ).toBeChecked();
  });

  it("moves focus into settings and returns it when Escape closes the dialog", async () => {
    let menuHandler: ((command: AppMenuCommand) => void) | null = null;
    listenForAppMenuCommandMock.mockImplementation(async (handler) => {
      menuHandler = handler;
      return () => undefined;
    });
    render(<App />);
    const tab = screen.getByRole("tab", { name: "Untitled.md" });
    tab.focus();

    await waitFor(() => {
      expect(listenForAppMenuCommandMock).toHaveBeenCalled();
    });
    act(() => {
      menuHandler?.("settings");
    });
    const dialog = await screen.findByRole("dialog", { name: "Settings" });

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Tabs" })).toHaveFocus();
    });
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
    });
    expect(tab).toHaveFocus();
  });

  it("opens selected files in a separate window when window mode is enabled", async () => {
    let menuHandler: ((command: AppMenuCommand) => void) | null = null;
    listenForAppMenuCommandMock.mockImplementation(async (handler) => {
      menuHandler = handler;
      return () => undefined;
    });
    localStorage.setItem("galley-pad.openMode", "windows");
    pickOpenFileMock.mockResolvedValue("/tmp/window.md");
    render(<App />);

    await waitFor(() => {
      expect(listenForAppMenuCommandMock).toHaveBeenCalled();
    });
    act(() => {
      menuHandler?.("open");
    });

    await waitFor(() => {
      expect(openMarkdownFileWindowMock).toHaveBeenCalledWith("/tmp/window.md");
    });
    expect(readTextFileMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "# Untitled\n\nStart writing Markdown.\n",
    );
  });

  it("opens OS file events in a separate window when window mode is enabled", async () => {
    let openHandler: ((path: string) => void) | null = null;
    listenForMarkdownFileOpenMock.mockImplementation(async (handler) => {
      openHandler = handler;
      return () => undefined;
    });
    localStorage.setItem("galley-pad.openMode", "windows");
    render(<App />);
    await waitFor(() => {
      expect(listenForMarkdownFileOpenMock).toHaveBeenCalled();
    });

    act(() => {
      openHandler?.("/tmp/event.md");
    });

    await waitFor(() => {
      expect(openMarkdownFileWindowMock).toHaveBeenCalledWith("/tmp/event.md");
    });
    expect(readTextFileMock).not.toHaveBeenCalled();
  });

  it("hides the Galley toolbar by default and toggles it from the native menu", async () => {
    let menuHandler: ((command: AppMenuCommand) => void) | null = null;
    listenForAppMenuCommandMock.mockImplementation(async (handler) => {
      menuHandler = handler;
      return () => undefined;
    });
    render(<App />);

    expect(
      screen.queryByRole("toolbar", { name: "Mock Galley Toolbar" }),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(listenForAppMenuCommandMock).toHaveBeenCalled();
    });
    act(() => {
      menuHandler?.("toggle-toolbar");
    });

    expect(
      screen.getByRole("toolbar", { name: "Mock Galley Toolbar" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mock toolbar icon count")).toHaveTextContent(
      "15",
    );
  });

  it("opens a pending Markdown file provided by the OS at startup", async () => {
    getPendingMarkdownFileOpensMock.mockResolvedValue(["/tmp/launch.md"]);
    readTextFileMock.mockResolvedValue({
      path: "/tmp/launch.md",
      content: "# Launch\n",
      lineEnding: "lf",
      lastModifiedAt: 30,
    });

    render(<App />);

    await waitFor(() => {
      expect(document.title).toBe("launch.md - Galley Pad");
    });
    expect(readTextFileMock).toHaveBeenCalledWith("/tmp/launch.md");
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "# Launch\n",
    );
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("opens every pending Markdown file provided by the OS at startup", async () => {
    getPendingMarkdownFileOpensMock.mockResolvedValue([
      "/tmp/one.md",
      "/tmp/two.markdown",
    ]);
    const firstRead = deferred<{
      path: string;
      content: string;
      lineEnding: "lf";
      lastModifiedAt: number;
    }>();
    const secondRead = deferred<{
      path: string;
      content: string;
      lineEnding: "lf";
      lastModifiedAt: number;
    }>();
    readTextFileMock.mockImplementation((path) => {
      if (path === "/tmp/one.md") {
        return firstRead.promise;
      }
      if (path === "/tmp/two.markdown") {
        return secondRead.promise;
      }
      throw new Error(`Unexpected read path: ${path}`);
    });

    render(<App />);

    await waitFor(() => {
      expect(readTextFileMock).toHaveBeenCalledWith("/tmp/one.md");
    });
    secondRead.resolve({
      path: "/tmp/two.markdown",
      content: "# Two\n",
      lineEnding: "lf",
      lastModifiedAt: 31,
    });
    expect(readTextFileMock).not.toHaveBeenCalledWith("/tmp/two.markdown");
    await act(async () => {
      firstRead.resolve({
        path: "/tmp/one.md",
        content: "# One\n",
        lineEnding: "lf",
        lastModifiedAt: 30,
      });
      await firstRead.promise;
    });

    await waitFor(() => {
      expect(readTextFileMock).toHaveBeenCalledWith("/tmp/two.markdown");
    });
    await act(async () => {
      await secondRead.promise;
    });
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "two.markdown" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
    expect(readTextFileMock).toHaveBeenCalledWith("/tmp/one.md");
    expect(readTextFileMock).toHaveBeenCalledWith("/tmp/two.markdown");
    expect(screen.getByRole("tab", { name: "one.md" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue("# Two\n");
  });

  it("opens a window launch query path in the current window", async () => {
    localStorage.setItem("galley-pad.openMode", "windows");
    window.history.replaceState(null, "", "/?open=/tmp/window.md");
    readTextFileMock.mockResolvedValue({
      path: "/tmp/window.md",
      content: "# Window\n",
      lineEnding: "lf",
      lastModifiedAt: 40,
    });

    render(<App />);

    await waitFor(() => {
      expect(document.title).toBe("window.md - Galley Pad");
    });
    expect(readTextFileMock).toHaveBeenCalledWith("/tmp/window.md");
    expect(openMarkdownFileWindowMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "# Window\n",
    );
  });

  it("opens Markdown files delivered by OS open-file events", async () => {
    let openHandler: ((path: string) => void) | null = null;
    listenForMarkdownFileOpenMock.mockImplementation(async (handler) => {
      openHandler = handler;
      return () => undefined;
    });
    readTextFileMock.mockResolvedValue({
      path: "/tmp/event.markdown",
      content: "# Event\n",
      lineEnding: "lf",
      lastModifiedAt: 31,
    });

    render(<App />);
    await waitFor(() => {
      expect(listenForMarkdownFileOpenMock).toHaveBeenCalled();
    });

    act(() => {
      openHandler?.("/tmp/event.markdown");
    });

    await waitFor(() => {
      expect(document.title).toBe("event.markdown - Galley Pad");
    });
    expect(readTextFileMock).toHaveBeenCalledWith("/tmp/event.markdown");
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue("# Event\n");
  });

  it("opens OS file events in a new tab without replacing a dirty tab", async () => {
    let openHandler: ((path: string) => void) | null = null;
    listenForMarkdownFileOpenMock.mockImplementation(async (handler) => {
      openHandler = handler;
      return () => undefined;
    });
    render(<App />);
    await waitFor(() => {
      expect(listenForMarkdownFileOpenMock).toHaveBeenCalled();
    });
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "Dirty external event draft" },
    });

    act(() => {
      openHandler?.("/tmp/event.md");
    });

    await waitFor(() => {
      expect(document.title).toBe("event.markdown - Galley Pad");
    });
    expect(window.confirm).not.toHaveBeenCalled();
    expect(readTextFileMock).toHaveBeenCalledWith("/tmp/event.md");
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue("# Event\n");
    fireEvent.click(screen.getByRole("tab", { name: "Untitled.md" }));
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "Dirty external event draft",
    );
  });

  it("keeps edits made while Open is pending", async () => {
    let menuHandler: ((command: AppMenuCommand) => void) | null = null;
    listenForAppMenuCommandMock.mockImplementation(async (handler) => {
      menuHandler = handler;
      return () => undefined;
    });
    const pendingRead = deferred<{
      path: string;
      content: string;
      lineEnding: "lf";
      lastModifiedAt: number;
    }>();
    pickOpenFileMock.mockResolvedValue("/tmp/opened.md");
    readTextFileMock.mockImplementation(() => pendingRead.promise);
    render(<App />);

    await waitFor(() => {
      expect(listenForAppMenuCommandMock).toHaveBeenCalled();
    });
    act(() => {
      menuHandler?.("open");
    });
    await waitFor(() => {
      expect(readTextFileMock).toHaveBeenCalledWith("/tmp/opened.md");
    });

    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "User edit while opening" },
    });

    await act(async () => {
      pendingRead.resolve({
        path: "/tmp/opened.md",
        content: "# Opened from disk\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      });
      await pendingRead.promise;
    });

    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "# Opened from disk\n",
    );
    expect(document.title).toBe("opened.md - Galley Pad");
    fireEvent.click(screen.getByRole("tab", { name: "Untitled.md" }));
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "User edit while opening",
    );
    expect(document.title).toBe("* Untitled.md - Galley Pad");
  });

  it("saves a dirty file-backed document", async () => {
    let menuHandler: ((command: AppMenuCommand) => void) | null = null;
    listenForAppMenuCommandMock.mockImplementation(async (handler) => {
      menuHandler = handler;
      return () => undefined;
    });
    pickOpenFileMock.mockResolvedValue("/tmp/opened.md");
    readTextFileMock
      .mockResolvedValueOnce({
        path: "/tmp/opened.md",
        content: "# Opened\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      })
      .mockResolvedValueOnce({
        path: "/tmp/opened.md",
        content: "# Opened\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      });
    writeTextFileMock.mockResolvedValue({
      path: "/tmp/opened.md",
      lineEnding: "lf",
      lastModifiedAt: 11,
    });
    render(<App />);

    await waitFor(() => {
      expect(listenForAppMenuCommandMock).toHaveBeenCalled();
    });
    act(() => {
      menuHandler?.("open");
    });
    await waitFor(() => {
      expect(document.title).toBe("opened.md - Galley Pad");
    });
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "# Opened\n\nUpdated.\n" },
    });
    act(() => {
      menuHandler?.("save");
    });

    await waitFor(() => {
      expect(writeTextFileMock).toHaveBeenCalledWith(
        "/tmp/opened.md",
        "# Opened\n\nUpdated.\n",
      );
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("keeps edits made while Save is pending", async () => {
    let menuHandler: ((command: AppMenuCommand) => void) | null = null;
    listenForAppMenuCommandMock.mockImplementation(async (handler) => {
      menuHandler = handler;
      return () => undefined;
    });
    const pendingWrite = deferred<{
      path: string;
      lineEnding: "lf";
      lastModifiedAt: number;
    }>();
    pickOpenFileMock.mockResolvedValue("/tmp/opened.md");
    readTextFileMock
      .mockResolvedValueOnce({
        path: "/tmp/opened.md",
        content: "# Opened\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      })
      .mockResolvedValueOnce({
        path: "/tmp/opened.md",
        content: "# Opened\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      });
    writeTextFileMock.mockImplementation(() => pendingWrite.promise);
    render(<App />);

    await waitFor(() => {
      expect(listenForAppMenuCommandMock).toHaveBeenCalled();
    });
    act(() => {
      menuHandler?.("open");
    });
    await waitFor(() => {
      expect(document.title).toBe("opened.md - Galley Pad");
    });
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "# Opened\n\nFirst edit.\n" },
    });
    act(() => {
      menuHandler?.("save");
    });
    await waitFor(() => {
      expect(writeTextFileMock).toHaveBeenCalledWith(
        "/tmp/opened.md",
        "# Opened\n\nFirst edit.\n",
      );
    });

    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "# Opened\n\nSecond edit.\n" },
    });

    await act(async () => {
      pendingWrite.resolve({
        path: "/tmp/opened.md",
        lineEnding: "lf",
        lastModifiedAt: 11,
      });
      await pendingWrite.promise;
    });

    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "# Opened\n\nSecond edit.\n",
    );
    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    expect(document.title).toBe("* opened.md - Galley Pad");
  });

  it("saves an untitled document through Save As", async () => {
    let menuHandler: ((command: AppMenuCommand) => void) | null = null;
    listenForAppMenuCommandMock.mockImplementation(async (handler) => {
      menuHandler = handler;
      return () => undefined;
    });
    pickSaveFileMock.mockResolvedValue("/tmp/new.md");
    writeTextFileMock.mockResolvedValue({
      path: "/tmp/new.md",
      lineEnding: "lf",
      lastModifiedAt: 20,
    });
    render(<App />);
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "# New content\n" },
    });

    await waitFor(() => {
      expect(listenForAppMenuCommandMock).toHaveBeenCalled();
    });
    act(() => {
      menuHandler?.("save");
    });

    await waitFor(() => {
      expect(writeTextFileMock).toHaveBeenCalledWith(
        "/tmp/new.md",
        "# New content\n",
      );
    });
    expect(document.title).toBe("new.md - Galley Pad");
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("keeps edits made while Save As is pending", async () => {
    let menuHandler: ((command: AppMenuCommand) => void) | null = null;
    listenForAppMenuCommandMock.mockImplementation(async (handler) => {
      menuHandler = handler;
      return () => undefined;
    });
    const pendingWrite = deferred<{
      path: string;
      lineEnding: "lf";
      lastModifiedAt: number;
    }>();
    pickSaveFileMock.mockResolvedValue("/tmp/new.md");
    writeTextFileMock.mockImplementation(() => pendingWrite.promise);
    render(<App />);
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "# First save as edit\n" },
    });

    await waitFor(() => {
      expect(listenForAppMenuCommandMock).toHaveBeenCalled();
    });
    act(() => {
      menuHandler?.("save-as");
    });
    await waitFor(() => {
      expect(writeTextFileMock).toHaveBeenCalledWith(
        "/tmp/new.md",
        "# First save as edit\n",
      );
    });

    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "# Second save as edit\n" },
    });

    await act(async () => {
      pendingWrite.resolve({
        path: "/tmp/new.md",
        lineEnding: "lf",
        lastModifiedAt: 20,
      });
      await pendingWrite.promise;
    });

    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "# Second save as edit\n",
    );
    expect(document.title).toBe("* new.md - Galley Pad");
    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    expect(document.title).toBe("* new.md - Galley Pad");
  });

  it("shows an error when Save detects an external file change", async () => {
    let menuHandler: ((command: AppMenuCommand) => void) | null = null;
    listenForAppMenuCommandMock.mockImplementation(async (handler) => {
      menuHandler = handler;
      return () => undefined;
    });
    pickOpenFileMock.mockResolvedValue("/tmp/opened.md");
    readTextFileMock
      .mockResolvedValueOnce({
        path: "/tmp/opened.md",
        content: "# Opened\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      })
      .mockResolvedValueOnce({
        path: "/tmp/opened.md",
        content: "# External\n",
        lineEnding: "lf",
        lastModifiedAt: 99,
    });
    render(<App />);

    await waitFor(() => {
      expect(listenForAppMenuCommandMock).toHaveBeenCalled();
    });
    act(() => {
      menuHandler?.("open");
    });
    await waitFor(() => {
      expect(document.title).toBe("opened.md - Galley Pad");
    });
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "# Local\n" },
    });
    act(() => {
      menuHandler?.("save");
    });

    await expect(
      screen.findByRole("alert", { name: "File command error" }),
    ).resolves.toHaveTextContent("Use Save As to avoid overwriting");
    expect(writeTextFileMock).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}
