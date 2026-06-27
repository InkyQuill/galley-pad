import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  MARKDOWN_FILE_OPENED_EVENT,
  getPendingMarkdownFileOpens,
  getWindowMarkdownFileOpen,
  listenForMarkdownFileOpen,
} from "./externalFiles";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);

describe("external Markdown file opens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    window.history.replaceState(null, "", "/");
  });

  it("does nothing in a plain browser without Tauri internals", async () => {
    const unlisten = await listenForMarkdownFileOpen(() => undefined);

    await expect(getPendingMarkdownFileOpens()).resolves.toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(listenMock).not.toHaveBeenCalled();
    expect(() => unlisten()).not.toThrow();
  });

  it("uses Tauri commands and events when Tauri internals are present", async () => {
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue(["/tmp/opened.md"]);
    listenMock.mockResolvedValue(() => undefined);

    await expect(getPendingMarkdownFileOpens()).resolves.toEqual(["/tmp/opened.md"]);
    await listenForMarkdownFileOpen(() => undefined);

    expect(invokeMock).toHaveBeenCalledWith("take_pending_markdown_file_opens");
    expect(listenMock).toHaveBeenCalledWith(
      MARKDOWN_FILE_OPENED_EVENT,
      expect.any(Function),
    );
  });

  it("reads a Markdown launch path from the current window query", () => {
    window.history.replaceState(null, "", "/?open=/tmp/a%20draft%20%231.md");

    expect(getWindowMarkdownFileOpen()).toBe("/tmp/a draft #1.md");
  });

  it("ignores missing window launch query values", () => {
    expect(getWindowMarkdownFileOpen()).toBeNull();
  });
});
