import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { UnsupportedFileEncodingError } from "../document/lifecycle";
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

  it("keeps unsupported encoding distinguishable and supports an explicit retry", async () => {
    const path = "/tmp/legacy.md";
    invokeMock.mockRejectedValueOnce({ kind: "unsupportedEncoding", message: "Unsupported encoding" });
    await expect(readTextFile(path)).rejects.toBeInstanceOf(UnsupportedFileEncodingError);

    invokeMock.mockResolvedValueOnce({ path, content: "Привет", encoding: "windows1251" });
    await expect(readTextFile(path, "windows1251")).resolves.toMatchObject({ content: "Привет" });
    expect(invokeMock).toHaveBeenLastCalledWith("read_text_file", { path, encoding: "windows1251" });
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
  it("passes the expected file snapshot and owner separately to the native writer", async () => {
    invokeMock.mockResolvedValueOnce({ path: "/tmp/draft.md", lineEnding: "crlf" });
    const expected = { kind: "present", content: "Base\r\n", encoding: "utf8Bom" } as const;

    await writeTextFile("/tmp/draft.md", "Local\r\n", {
      tabId: "tab-1",
      encoding: "utf8Bom",
      expected,
    });

    expect(invokeMock).toHaveBeenCalledExactlyOnceWith("write_text_file", {
      path: "/tmp/draft.md",
      content: "Local\r\n",
      options: { encoding: "utf8Bom", expected },
      tabId: "tab-1",
    });
  });

});
