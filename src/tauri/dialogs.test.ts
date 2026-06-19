import { open, save } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pickOpenFile, pickSaveFile } from "./dialogs";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

const openMock = vi.mocked(open);
const saveMock = vi.mocked(save);

describe("dialog wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a single Markdown-compatible file picker", async () => {
    openMock.mockResolvedValue("/tmp/draft.md");

    await expect(pickOpenFile()).resolves.toBe("/tmp/draft.md");

    expect(openMock).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Markdown and text",
          extensions: ["md", "markdown", "txt"],
        },
      ],
    });
  });

  it("treats cancelled or multi-select open results as no selection", async () => {
    openMock.mockResolvedValueOnce(null);
    await expect(pickOpenFile()).resolves.toBeNull();

    openMock.mockResolvedValueOnce(["/tmp/a.md", "/tmp/b.md"]);
    await expect(pickOpenFile()).resolves.toBeNull();
  });

  it("opens a Markdown-compatible save picker with a default path", async () => {
    saveMock.mockResolvedValue("/tmp/saved.md");

    await expect(pickSaveFile("Untitled.md")).resolves.toBe("/tmp/saved.md");

    expect(saveMock).toHaveBeenCalledWith({
      defaultPath: "Untitled.md",
      filters: [
        {
          name: "Markdown",
          extensions: ["md", "markdown"],
        },
        {
          name: "Text",
          extensions: ["txt"],
        },
      ],
    });
  });

  it("omits defaultPath when Save As has no useful default", async () => {
    saveMock.mockResolvedValue(null);

    await expect(pickSaveFile(null)).resolves.toBeNull();

    expect(saveMock).toHaveBeenCalledWith({
      filters: [
        {
          name: "Markdown",
          extensions: ["md", "markdown"],
        },
        {
          name: "Text",
          extensions: ["txt"],
        },
      ],
    });
  });

  it("omits defaultPath when Save As default is only whitespace", async () => {
    saveMock.mockResolvedValue(null);

    await expect(pickSaveFile("   ")).resolves.toBeNull();

    expect(saveMock).toHaveBeenCalledWith({
      filters: [
        {
          name: "Markdown",
          extensions: ["md", "markdown"],
        },
        {
          name: "Text",
          extensions: ["txt"],
        },
      ],
    });
  });
});
