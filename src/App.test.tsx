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
import { listSystemFonts } from "./tauri/systemFonts";
import {
  clearSwapState,
  readAppSettings,
  readSwapState,
  writeAppSettings,
  writeSwapState,
} from "./tauri/appPersistence";
import { listenForWindowCloseRequest } from "./tauri/windowClose";

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
vi.mock("./tauri/systemFonts", () => ({
  listSystemFonts: vi.fn(),
}));
vi.mock("./tauri/appPersistence", () => ({
  clearSwapState: vi.fn(),
  readAppSettings: vi.fn(),
  readSwapState: vi.fn(),
  writeAppSettings: vi.fn(),
  writeSwapState: vi.fn(),
}));
vi.mock("./tauri/windowClose", () => ({
  listenForWindowCloseRequest: vi.fn(),
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
const listSystemFontsMock = vi.mocked(listSystemFonts);
const clearSwapStateMock = vi.mocked(clearSwapState);
const readAppSettingsMock = vi.mocked(readAppSettings);
const readSwapStateMock = vi.mocked(readSwapState);
const writeAppSettingsMock = vi.mocked(writeAppSettings);
const writeSwapStateMock = vi.mocked(writeSwapState);
const listenForWindowCloseRequestMock = vi.mocked(listenForWindowCloseRequest);

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
    listenForWindowCloseRequestMock.mockResolvedValue(() => undefined);
    openMarkdownFileWindowMock.mockResolvedValue("markdown-file-1");
    clearSwapStateMock.mockResolvedValue();
    readAppSettingsMock.mockResolvedValue(null);
    readSwapStateMock.mockResolvedValue(null);
    writeAppSettingsMock.mockResolvedValue();
    writeSwapStateMock.mockResolvedValue();
    listSystemFontsMock.mockResolvedValue({
      locale: "ru-RU",
      previewText: "Aa Bb Cc Аа Бб Вв 0123456789 Съешь ещё этих мягких булок",
      fonts: [
        {
          family: "Fira Code",
          cssValue: '"Fira Code", sans-serif',
          monospaced: true,
        },
        {
          family: "Inter",
          cssValue: '"Inter", sans-serif',
          monospaced: false,
        },
      ],
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: undefined,
    });
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
    expect(screen.getByLabelText("Mock Galley Footer")).toHaveTextContent("Draft");
    expect(screen.getByLabelText("Mock Galley Footer")).toHaveTextContent(
      "5 words",
    );
    expect(document.title).toBe("Untitled.md - Galley Pad");

    const appShell = container.querySelector(".app-shell");
    expect(appShell?.children.item(0)).toHaveClass("tabstrip");
    expect(appShell?.children.item(1)).toHaveClass("command-error-slot");
    expect(appShell?.children.item(2)).toHaveClass("document-view");
    expect(
      screen.queryByRole("alert", { name: "File command error" }),
    ).not.toBeInTheDocument();
  });

  it("applies persisted theme settings to the app shell and editor", async () => {
    readAppSettingsMock.mockResolvedValue({
      themeSettings: {
        mode: "constant",
        constantThemeId: "tokyo-night",
        lightThemeId: "galley-light",
        darkThemeId: "galley-dark",
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("mock-galley-editor-shell")).toHaveAttribute(
        "data-theme",
        "dark",
      );
    });

    const appShell = screen.getByTestId("app-shell");
    expect(appShell.style.getPropertyValue("--app-bg")).not.toBe("");
    expect(appShell.style.getPropertyValue("--ge-color-bg")).not.toBe("");
    expect(
      screen
        .getByTestId("mock-galley-editor-shell")
        .style.getPropertyValue("--ge-color-bg"),
    ).toBe("#1a1b26");
    expect(
      screen
        .getByTestId("mock-galley-editor-shell")
        .style.getPropertyValue("--ge-color-link"),
    ).toBe("#7aa2f7");
  });

  it("updates resolved system theme variables when the system color scheme changes", async () => {
    const systemColorScheme = mockSystemColorScheme(false);
    readAppSettingsMock.mockResolvedValue({
      themeSettings: {
        mode: "system",
        constantThemeId: "tokyo-night",
        lightThemeId: "galley-light",
        darkThemeId: "galley-dark",
      },
    });

    render(<App />);

    const appShell = screen.getByTestId("app-shell");
    await waitFor(() => {
      expect(screen.getByTestId("mock-galley-editor-shell")).toHaveAttribute(
        "data-theme",
        "auto",
      );
      expect(appShell.style.getPropertyValue("--ge-color-bg")).not.toBe("");
    });
    const lightEditorBg = appShell.style.getPropertyValue("--ge-color-bg");

    act(() => {
      systemColorScheme.setDark(true);
    });

    await waitFor(() => {
      expect(appShell.style.getPropertyValue("--ge-color-bg")).not.toBe(
        lightEditorBg,
      );
    });
    expect(screen.getByTestId("mock-galley-editor-shell")).toHaveAttribute(
      "data-theme",
      "auto",
    );
  });

  it("normalizes mismatched persisted system theme selections before opening settings", async () => {
    readAppSettingsMock.mockResolvedValue({
      appearanceTheme: "system",
      themeSettings: {
        mode: "system",
        constantThemeId: "catppuccin-mocha",
        lightThemeId: "tokyo-night",
        darkThemeId: "solarized-light",
      },
      editorFontFamily: "Inter",
      editorFontSize: "large",
      openMode: "windows",
    });

    render(<App />);
    const appShell = screen.getByTestId("app-shell");

    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    await screen.findByRole("dialog", { name: "Settings" });

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "System-based" })).toBeChecked();
      expect(screen.getByRole("combobox", { name: "Light theme" })).toHaveValue(
        "galley-light",
      );
      expect(screen.getByRole("combobox", { name: "Dark theme" })).toHaveValue(
        "galley-dark",
      );
      expect(appShell.style.getPropertyValue("--ge-color-bg")).toBe("#fbfaf7");
    });
    await waitFor(() => {
      expect(writeAppSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          appearanceTheme: "system",
          themeSettings: expect.objectContaining({
            mode: "system",
            constantThemeId: "catppuccin-mocha",
            lightThemeId: "galley-light",
            darkThemeId: "galley-dark",
          }),
          editorFontFamily: "Inter",
          editorFontSize: "large",
          openMode: "windows",
        }),
      );
    });
  });

  it("repairs mismatched local theme settings during startup", () => {
    localStorage.setItem(
      "galley-pad.themeSettings",
      JSON.stringify({
        mode: "system",
        constantThemeId: "catppuccin-mocha",
        lightThemeId: "tokyo-night",
        darkThemeId: "solarized-light",
      }),
    );

    render(<App />);

    expect(JSON.parse(localStorage.getItem("galley-pad.themeSettings")!)).toEqual(
      {
        mode: "system",
        constantThemeId: "catppuccin-mocha",
        lightThemeId: "galley-light",
        darkThemeId: "galley-dark",
      },
    );
  });

  it("marks the session dirty when editor content changes and updates the title", () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "One two three" },
    });

    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    expect(screen.getByLabelText("Mock Galley Footer")).toHaveTextContent(
      "3 words",
    );
    expect(document.title).toBe("* Untitled.md - Galley Pad");
  });

  it("writes a swap snapshot for dirty edits", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "Swap protected draft" },
    });

    await waitFor(() => {
      expect(writeSwapStateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 1,
          tabs: expect.arrayContaining([
            expect.objectContaining({
              session: expect.objectContaining({
                content: "Swap protected draft",
                dirty: true,
              }),
            }),
          ]),
        }),
      );
    });
  });

  it("waits for swap restoration before applying pending file opens", async () => {
    const pendingSwap = deferred<Awaited<ReturnType<typeof readSwapState>>>();
    readSwapStateMock.mockReturnValue(pendingSwap.promise);
    getPendingMarkdownFileOpensMock.mockResolvedValue(["/tmp/pending.md"]);
    readTextFileMock.mockResolvedValue({
      path: "/tmp/pending.md",
      content: "# Pending\n",
      lineEnding: "lf",
      lastModifiedAt: 12,
    });

    render(<App />);

    await waitFor(() => {
      expect(readSwapStateMock).toHaveBeenCalled();
    });
    expect(getPendingMarkdownFileOpensMock).not.toHaveBeenCalled();
    expect(readTextFileMock).not.toHaveBeenCalledWith("/tmp/pending.md");

    await act(async () => {
      pendingSwap.resolve(null);
      await pendingSwap.promise;
    });

    await waitFor(() => {
      expect(getPendingMarkdownFileOpensMock).toHaveBeenCalled();
      expect(readTextFileMock).toHaveBeenCalledWith("/tmp/pending.md");
    });
  });

  it("lets an explicit launch file take precedence over restored swap state", async () => {
    window.history.replaceState(null, "", "/?open=/tmp/launch.md");
    readSwapStateMock.mockResolvedValue({
      version: 1,
      savedAt: 1,
      activeTabId: "swap-tab",
      openMode: "tabs",
      tabs: [
        {
          id: "swap-tab",
          session: {
            id: "swap-session",
            path: null,
            displayName: "Swap.md",
            content: "Dirty swap",
            savedContent: "",
            dirty: true,
            lineEnding: "lf",
            lastKnownModifiedAt: null,
          },
        },
      ],
    });
    readTextFileMock.mockResolvedValue({
      path: "/tmp/launch.md",
      content: "# Launch\n",
      lineEnding: "lf",
      lastModifiedAt: 20,
    });

    render(<App />);

    await waitFor(() => {
      expect(document.title).toBe("launch.md - Galley Pad");
    });
    expect(screen.queryByRole("tab", { name: "Swap.md" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue("# Launch\n");
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

  it("asks before closing a dirty tab and supports cancel or discard", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Close Untitled.md" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
        "Dirty draft",
      );
    });
    expect(screen.getAllByRole("tab", { name: /Untitled\.md/ })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Close Untitled.md" }));
    const dialog = await screen.findByRole("dialog", { name: "Save changes?" });
    expect(dialog).toHaveTextContent("Untitled.md has unsaved changes.");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Save changes?" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue("Dirty draft");

    fireEvent.click(screen.getByRole("button", { name: "Close Untitled.md" }));
    await screen.findByRole("dialog", { name: "Save changes?" });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
        "# Untitled\n\nStart writing Markdown.\n",
      );
    });
  });

  it("saves a dirty file-backed document when window close is requested", async () => {
    let closeHandler: (() => Promise<boolean>) | null = null;
    listenForWindowCloseRequestMock.mockImplementation(async (handler) => {
      closeHandler = handler;
      return () => undefined;
    });
    window.history.replaceState(null, "", "/?open=/tmp/opened.md");
    readTextFileMock.mockResolvedValue({
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
      expect(document.title).toBe("opened.md - Galley Pad");
    });
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "# Opened\n\nChanged before close.\n" },
    });

    expect(closeHandler).not.toBeNull();
    const closeResult = closeHandler!();
    const dialog = await screen.findByRole("dialog", { name: "Save changes?" });
    expect(dialog).toHaveTextContent("opened.md has unsaved changes.");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await expect(closeResult).resolves.toBe(true);
    expect(writeTextFileMock).toHaveBeenCalledWith(
      "/tmp/opened.md",
      "# Opened\n\nChanged before close.\n",
    );
    expect(clearSwapStateMock).toHaveBeenCalled();
  });

  it("does not block an approved window close when swap cleanup fails", async () => {
    let closeHandler: (() => Promise<boolean>) | null = null;
    listenForWindowCloseRequestMock.mockImplementation(async (handler) => {
      closeHandler = handler;
      return () => undefined;
    });
    clearSwapStateMock.mockRejectedValue(new Error("swap cleanup failed"));
    render(<App />);

    expect(closeHandler).not.toBeNull();

    await expect(closeHandler!()).resolves.toBe(true);
    expect(
      await screen.findByRole("alert", { name: "File command error" }),
    ).toHaveTextContent("swap cleanup failed");
  });

  it("does not write a debounced swap snapshot after closing is approved", async () => {
    let closeHandler: (() => Promise<boolean>) | null = null;
    listenForWindowCloseRequestMock.mockImplementation(async (handler) => {
      closeHandler = handler;
      return () => undefined;
    });
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    try {
      render(<App />);
      fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
        target: { value: "Dirty before close" },
      });

      expect(closeHandler).not.toBeNull();
      const closeResult = closeHandler!();
      await screen.findByRole("dialog", { name: "Save changes?" });
      fireEvent.click(screen.getByRole("button", { name: "Discard" }));

      await expect(closeResult).resolves.toBe(true);

      expect(writeSwapStateMock).not.toHaveBeenCalled();
      expect(clearSwapStateMock).toHaveBeenCalled();
      expect(clearTimeoutSpy).toHaveBeenCalled();
    } finally {
      clearTimeoutSpy.mockRestore();
    }
  });

  it("waits for an in-flight swap write before clearing swap state on close", async () => {
    let closeHandler: (() => Promise<boolean>) | null = null;
    listenForWindowCloseRequestMock.mockImplementation(async (handler) => {
      closeHandler = handler;
      return () => undefined;
    });
    const pendingSwapWrite = deferred<void>();
    writeSwapStateMock.mockReturnValue(pendingSwapWrite.promise);
    render(<App />);
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "Dirty before close" },
    });

    await waitFor(() => {
      expect(writeSwapStateMock).toHaveBeenCalled();
    });
    expect(closeHandler).not.toBeNull();
    const closeResult = closeHandler!();
    await screen.findByRole("dialog", { name: "Save changes?" });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(clearSwapStateMock).not.toHaveBeenCalled();

    await act(async () => {
      pendingSwapWrite.resolve(undefined);
      await pendingSwapWrite.promise;
    });

    await expect(closeResult).resolves.toBe(true);
    expect(clearSwapStateMock).toHaveBeenCalled();
  });

  it("waits for an in-flight app settings write before clearing swap state on close", async () => {
    let closeHandler: (() => Promise<boolean>) | null = null;
    let menuHandler: ((command: AppMenuCommand) => void) | null = null;
    listenForWindowCloseRequestMock.mockImplementation(async (handler) => {
      closeHandler = handler;
      return () => undefined;
    });
    listenForAppMenuCommandMock.mockImplementation(async (handler) => {
      menuHandler = handler;
      return () => undefined;
    });
    const pendingSettingsWrite = deferred<void>();
    writeAppSettingsMock.mockReturnValueOnce(pendingSettingsWrite.promise);
    render(<App />);

    await waitFor(() => {
      expect(listenForAppMenuCommandMock).toHaveBeenCalled();
    });
    act(() => {
      menuHandler?.("settings");
    });
    await screen.findByRole("dialog", { name: "Settings" });
    fireEvent.click(screen.getByRole("radio", { name: "Constant" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), {
      target: { value: "catppuccin-mocha" },
    });
    expect(writeAppSettingsMock).toHaveBeenCalledTimes(1);

    expect(closeHandler).not.toBeNull();
    const closeResult = closeHandler!();
    await act(async () => {
      await Promise.resolve();
    });
    expect(clearSwapStateMock).not.toHaveBeenCalled();

    await act(async () => {
      pendingSettingsWrite.resolve(undefined);
      await pendingSettingsWrite.promise;
    });

    await expect(closeResult).resolves.toBe(true);
    expect(clearSwapStateMock).toHaveBeenCalled();
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
    expect(screen.queryByRole("tab", { name: "Untitled.md" })).not.toBeInTheDocument();
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

  it("opens settings from the native menu and persists constant theme preferences", async () => {
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
    fireEvent.click(screen.getByRole("radio", { name: "Constant" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), {
      target: { value: "catppuccin-mocha" },
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /System default/ })).toHaveTextContent(
        "Съешь",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /System default/ }));
    await screen.findByRole("searchbox", { name: "Search fonts" });
    const listbox = screen.getByRole("listbox", { name: "Editor font family" });
    expect(listbox.parentElement).toHaveClass("font-picker__popover");
    expect(listbox.parentElement?.parentElement).toBe(
      screen.getByRole("dialog", { name: "Settings" }),
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "fira" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /Fira Code/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Editor font size" }), {
      target: { value: "large" },
    });

    expect(localStorage.getItem("galley-pad.openMode")).toBe("windows");
    expect(JSON.parse(localStorage.getItem("galley-pad.themeSettings")!)).toEqual(
      expect.objectContaining({
        mode: "constant",
        constantThemeId: "catppuccin-mocha",
      }),
    );
    expect(localStorage.getItem("galley-pad.editorFontFamily")).toBe("Fira Code");
    expect(localStorage.getItem("galley-pad.editorFontSize")).toBe("large");
    expect(
      screen.getByRole("radio", { name: "Separate windows" }),
    ).toBeChecked();
    expect(screen.getByRole("radio", { name: "Constant" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Theme" })).toHaveValue(
      "catppuccin-mocha",
    );
    expect(
      screen.queryByRole("combobox", { name: "Light theme" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("mock-galley-editor-shell")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    expect(screen.getByTestId("mock-galley-editor-shell").style.getPropertyValue(
      "--ge-font-body",
    )).toContain("Fira Code");
    expect(screen.getByTestId("mock-galley-editor-shell")).toHaveStyle({
      "--ge-font-size": "1.125rem",
    });
    await waitFor(() => {
      expect(writeAppSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          themeSettings: expect.objectContaining({
            mode: "constant",
            constantThemeId: "catppuccin-mocha",
          }),
          editorFontFamily: "Fira Code",
          editorFontSize: "large",
          openMode: "windows",
        }),
      );
    });
  });

  it("coalesces concurrent app settings writes to the latest snapshot", async () => {
    let menuHandler: ((command: AppMenuCommand) => void) | null = null;
    listenForAppMenuCommandMock.mockImplementation(async (handler) => {
      menuHandler = handler;
      return () => undefined;
    });
    const firstWrite = deferred<void>();
    writeAppSettingsMock
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValue(undefined);
    render(<App />);

    await waitFor(() => {
      expect(listenForAppMenuCommandMock).toHaveBeenCalled();
    });
    act(() => {
      menuHandler?.("settings");
    });
    await screen.findByRole("dialog", { name: "Settings" });

    fireEvent.click(screen.getByRole("radio", { name: "Constant" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), {
      target: { value: "catppuccin-mocha" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Separate windows" }));

    expect(writeAppSettingsMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstWrite.resolve(undefined);
      await firstWrite.promise;
    });

    await waitFor(() => {
      expect(writeAppSettingsMock).toHaveBeenCalledTimes(2);
    });
    expect(writeAppSettingsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        themeSettings: expect.objectContaining({
          mode: "constant",
          constantThemeId: "catppuccin-mocha",
        }),
        openMode: "windows",
      }),
    );
  });

  it("persists system-based light and dark theme selections", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    await screen.findByRole("dialog", { name: "Settings" });
    fireEvent.click(screen.getByRole("radio", { name: "System-based" }));

    expect(
      screen.getByRole("combobox", { name: "Light theme" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Dark theme" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Light theme" }), {
      target: { value: "solarized-light" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Dark theme" }), {
      target: { value: "tokyo-night" },
    });

    await waitFor(() => {
      expect(writeAppSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          themeSettings: expect.objectContaining({
            mode: "system",
            lightThemeId: "solarized-light",
            darkThemeId: "tokyo-night",
          }),
        }),
      );
    });
  });

  it("shows native theme mode as unavailable", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    await screen.findByRole("dialog", { name: "Settings" });

    expect(screen.getByRole("radio", { name: /Native/ })).toBeDisabled();
    expect(
      screen.getByText("Native shell colors are not available yet."),
    ).toBeVisible();
  });

  it("does not let late startup settings overwrite user preference edits", async () => {
    const pendingSettings = deferred<Awaited<ReturnType<typeof readAppSettings>>>();
    readAppSettingsMock.mockReturnValue(pendingSettings.promise);
    render(<App />);

    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    await screen.findByRole("dialog", { name: "Settings" });
    fireEvent.click(screen.getByRole("radio", { name: "Constant" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), {
      target: { value: "catppuccin-mocha" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Separate windows" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Editor font size" }), {
      target: { value: "large" },
    });

    await act(async () => {
      pendingSettings.resolve({
        appearanceTheme: "galley-light",
        editorFontFamily: "Inter",
        editorFontSize: "small",
        openMode: "tabs",
      });
      await pendingSettings.promise;
    });

    expect(screen.getByRole("radio", { name: "Constant" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Theme" })).toHaveValue(
      "catppuccin-mocha",
    );
    expect(screen.getByRole("radio", { name: "Separate windows" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Editor font size" })).toHaveValue(
      "large",
    );
    expect(JSON.parse(localStorage.getItem("galley-pad.themeSettings")!)).toEqual(
      expect.objectContaining({
        mode: "constant",
        constantThemeId: "catppuccin-mocha",
      }),
    );
    expect(localStorage.getItem("galley-pad.openMode")).toBe("windows");
    expect(localStorage.getItem("galley-pad.editorFontSize")).toBe("large");
  });

  it("opens settings with the standard keyboard shortcut", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: ",", ctrlKey: true });

    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeInTheDocument();
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
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.queryByRole("tab", { name: "Untitled.md" })).not.toBeInTheDocument();
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
    readTextFileMock
      .mockImplementationOnce(() => firstRead.promise)
      .mockImplementationOnce(() => secondRead.promise);

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
    expect(screen.queryByRole("tab", { name: "Untitled.md" })).not.toBeInTheDocument();
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
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.queryByRole("tab", { name: "Untitled.md" })).not.toBeInTheDocument();
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

  it("opens Markdown file events serially in arrival order", async () => {
    let openHandler: ((path: string) => void) | null = null;
    listenForMarkdownFileOpenMock.mockImplementation(async (handler) => {
      openHandler = handler;
      return () => undefined;
    });
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
    readTextFileMock
      .mockImplementationOnce(() => firstRead.promise)
      .mockImplementationOnce(() => secondRead.promise);

    render(<App />);
    await waitFor(() => {
      expect(listenForMarkdownFileOpenMock).toHaveBeenCalled();
    });

    act(() => {
      openHandler?.("/tmp/one.md");
      openHandler?.("/tmp/two.markdown");
    });
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
    expect(screen.getByRole("tab", { name: "one.md" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue("# Two\n");
  });

  it("serializes pending startup files and live OS file events together", async () => {
    let openHandler: ((path: string) => void) | null = null;
    listenForMarkdownFileOpenMock.mockImplementation(async (handler) => {
      openHandler = handler;
      return () => undefined;
    });
    getPendingMarkdownFileOpensMock.mockResolvedValue(["/tmp/start.md"]);
    const startupRead = deferred<{
      path: string;
      content: string;
      lineEnding: "lf";
      lastModifiedAt: number;
    }>();
    const liveRead = deferred<{
      path: string;
      content: string;
      lineEnding: "lf";
      lastModifiedAt: number;
    }>();
    readTextFileMock
      .mockImplementationOnce(() => startupRead.promise)
      .mockImplementationOnce(() => liveRead.promise);

    render(<App />);
    await waitFor(() => {
      expect(readTextFileMock).toHaveBeenCalledWith("/tmp/start.md");
      expect(listenForMarkdownFileOpenMock).toHaveBeenCalled();
    });

    act(() => {
      openHandler?.("/tmp/live.md");
    });
    liveRead.resolve({
      path: "/tmp/live.md",
      content: "# Live\n",
      lineEnding: "lf",
      lastModifiedAt: 41,
    });
    expect(readTextFileMock).not.toHaveBeenCalledWith("/tmp/live.md");
    await act(async () => {
      startupRead.resolve({
        path: "/tmp/start.md",
        content: "# Start\n",
        lineEnding: "lf",
        lastModifiedAt: 40,
      });
      await startupRead.promise;
    });

    await waitFor(() => {
      expect(readTextFileMock).toHaveBeenCalledWith("/tmp/live.md");
    });
    await act(async () => {
      await liveRead.promise;
    });
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "live.md" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
    expect(screen.getByRole("tab", { name: "start.md" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue("# Live\n");
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

    fireEvent.click(screen.getByRole("button", { name: "Dismiss file command error" }));

    expect(
      screen.queryByRole("alert", { name: "File command error" }),
    ).not.toBeInTheDocument();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

function mockSystemColorScheme(initialDark: boolean) {
  let matches = initialDark;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = "(prefers-color-scheme: dark)";

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query === media ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(
        (event: string, listener: (event: MediaQueryListEvent) => void) => {
          if (query === media && event === "change") {
            listeners.add(listener);
          }
        },
      ),
      removeEventListener: vi.fn(
        (event: string, listener: (event: MediaQueryListEvent) => void) => {
          if (query === media && event === "change") {
            listeners.delete(listener);
          }
        },
      ),
      addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
        if (query === media) {
          listeners.add(listener);
        }
      }),
      removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
        if (query === media) {
          listeners.delete(listener);
        }
      }),
      dispatchEvent: vi.fn(),
    })),
  });

  return {
    setDark(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches, media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}
