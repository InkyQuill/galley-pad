import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openDraftWindow, openMarkdownFileWindow, setCurrentWindowTitle } from "./windows";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("Tauri windows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("does nothing outside Tauri", async () => {
    await openMarkdownFileWindow("/tmp/opened.md");
    await openDraftWindow();
    await setCurrentWindowTitle("* Untitled.md - Galley Pad");

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("asks Tauri to open a Markdown file in a new window", async () => {
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue("markdown-file-1");

    await expect(openMarkdownFileWindow("/tmp/opened.md")).resolves.toBe(
      "markdown-file-1",
    );

    expect(invokeMock).toHaveBeenCalledWith("open_markdown_file_window", {
      path: "/tmp/opened.md",
    });
  });
  it("creates a draft window and updates a dirty document's native title", async () => {
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue("markdown-file-2");
    const setTitle = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getCurrentWindow, { partial: true }).mockReturnValue({ setTitle });

    await expect(openDraftWindow()).resolves.toBe("markdown-file-2");
    expect(invokeMock).toHaveBeenCalledWith("open_draft_window");
    await setCurrentWindowTitle("* Draft.md - Galley Pad");
    expect(setTitle).toHaveBeenCalledWith("* Draft.md - Galley Pad");
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

});
