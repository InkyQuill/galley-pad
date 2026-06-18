import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { FileReadResult, FileWriteResult } from "../document/session";
import { readTextFile, writeTextFile } from "./files";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("Tauri file command wrappers", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("reads a text file through the Tauri command", async () => {
    const result: FileReadResult = {
      path: "/tmp/draft.md",
      content: "# Draft\n",
      lineEnding: "lf",
      lastModifiedAt: 1_765_000_000_000,
    };
    invokeMock.mockResolvedValueOnce(result);

    await expect(readTextFile("/tmp/draft.md")).resolves.toEqual(result);

    expect(invokeMock).toHaveBeenCalledExactlyOnceWith("read_text_file", {
      path: "/tmp/draft.md",
    });
  });

  it("writes a text file through the Tauri command", async () => {
    const result: FileWriteResult = {
      path: "/tmp/draft.md",
      lineEnding: "lf",
      lastModifiedAt: 1_765_000_001_000,
    };
    invokeMock.mockResolvedValueOnce(result);

    await expect(writeTextFile("/tmp/draft.md", "Saved\n")).resolves.toEqual(
      result,
    );

    expect(invokeMock).toHaveBeenCalledExactlyOnceWith("write_text_file", {
      path: "/tmp/draft.md",
      content: "Saved\n",
    });
  });
});
