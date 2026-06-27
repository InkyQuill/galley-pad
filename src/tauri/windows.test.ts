import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { openMarkdownFileWindow } from "./windows";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("Tauri windows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("does nothing outside Tauri", async () => {
    await openMarkdownFileWindow("/tmp/opened.md");

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
});
