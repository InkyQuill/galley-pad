import { describe, expect, it, vi } from "vitest";

import { createSwapState, restoreWorkspaceFromSwap } from "./recovery";
import { createSessionFromFile, createUntitledSession, updateSessionContent, type FileReadResult } from "./session";
import { saveDocument } from "./lifecycle";

const dirtyDisk: FileReadResult = {
  path: "/drafts/dirty.md", encoding: "utf16Le", content: "original",
  lineEnding: "crlf", lastModifiedAt: 20,
};
const cleanDisk: FileReadResult = {
  path: "/drafts/saved.md", encoding: "windows1251", content: "старый текст",
  lineEnding: "lf", lastModifiedAt: 21,
};
const dirty = {
  ...updateSessionContent(createSessionFromFile(dirtyDisk), "draft"),
  savedDiskContent: "exact baseline",
};
const clean = createSessionFromFile(cleanDisk);

describe("recovery snapshots", () => {
  it("writes only dirty bodies and reopens clean tabs with their prior encoding and current disk content", async () => {
    const snapshot = createSwapState({
      openMode: "tabs", activeTabId: "clean", tabs: [
        { id: "dirty", session: dirty },
        { id: "clean", session: clean },
      ],
    })!;
    expect(snapshot.tabs[0].session).toMatchObject({
      content: "draft", savedContent: "original", savedDiskContent: "exact baseline", encoding: "utf16Le",
    });
    expect(snapshot.tabs[1].session).not.toHaveProperty("content");
    expect(snapshot.tabs[1].session).not.toHaveProperty("savedContent");
    expect(snapshot.tabs[1].session).not.toHaveProperty("savedDiskContent");

    const read = vi.fn(async () => ({ ...cleanDisk, content: "новый текст", lastModifiedAt: 25 }));
    const restored = await restoreWorkspaceFromSwap(snapshot, {
      claim: async (path) => path,
      release: vi.fn(async () => undefined),
      read,
    });
    expect(read).toHaveBeenCalledExactlyOnceWith(cleanDisk.path, "windows1251");
    expect(restored?.workspace.activeTabId).toBe("clean");
    expect(restored?.workspace.tabs.map((tab) => tab.session.content)).toEqual(["draft", "новый текст"]);
    const restoredDirty = restored!.workspace.tabs[0].session;
    expect(restoredDirty.encoding).toBe("utf16Le");
    expect(restoredDirty.lineEnding).toBe("crlf");
    const writeTextFile = vi.fn(async () => ({ ...dirtyDisk, lastModifiedAt: 30 }));
    await saveDocument(restoredDirty, {
      pickOpenFile: vi.fn(), pickSaveFile: vi.fn(),
      readTextFile: vi.fn(async () => ({ ...dirtyDisk, content: "exact baseline" })),
      writeTextFile,
    }, "dirty");
    expect(writeTextFile).toHaveBeenCalledWith(dirtyDisk.path, "draft", expect.objectContaining({
      encoding: "utf16Le", expected: { kind: "present", content: "exact baseline", encoding: "utf16Le" },
    }));
  });

  it("keeps legacy clean bodies as unsaved drafts if their file is unavailable", async () => {
    const restored = await restoreWorkspaceFromSwap({
      version: 1, savedAt: 1, openMode: "tabs", activeTabId: "legacy", tabs: [
        { id: "dirty", session: dirty },
        { id: "legacy", session: clean },
      ],
    }, {
      claim: async (path) => path,
      release: vi.fn(async () => undefined),
      read: async () => { throw new Error("unreadable"); },
    });
    const legacy = restored?.workspace.tabs[1].session;
    expect(legacy).toMatchObject({ content: cleanDisk.content, path: null, dirty: true, encoding: "windows1251" });
  });

  it("has no crash draft to restore when all documents are clean", async () => {
    expect(createSwapState({
      openMode: "tabs", activeTabId: "clean", tabs: [{ id: "clean", session: clean }],
    })).toBeNull();

    const claim = vi.fn(async (path: string) => path);
    expect(await restoreWorkspaceFromSwap({
      version: 1, savedAt: 1, openMode: "tabs", activeTabId: "clean",
      tabs: [{ id: "clean", session: clean }],
    }, { claim, release: vi.fn(), read: vi.fn() })).toBeNull();
    expect(claim).not.toHaveBeenCalled();
  });

  it("restores a CLI draft target and keeps dirty content when ownership fails", async () => {
    const missing: FileReadResult = {
      path: "/drafts/new.md", content: "", lastModifiedAt: null, lineEnding: "lf", exists: false,
    };
    const restored = await restoreWorkspaceFromSwap({
      version: 1, savedAt: 1, openMode: "tabs", activeTabId: "missing-clean",
      tabs: [
        { id: "dirty", session: dirty },
        { id: "new", session: createSessionFromFile(missing) },
        { id: "untitled", session: createUntitledSession() },
        { id: "missing-clean", session: { ...clean, content: "", savedContent: "" } },
      ],
    }, {
      claim: async (path) => {
        if (path === dirtyDisk.path) throw new Error("Another window owns the file");
        return path;
      },
      release: vi.fn(async () => { throw new Error("Already released"); }),
      read: vi.fn(async (path) => ({ ...missing, path })),
    });

    expect(restored?.unavailableCount).toBe(1);
    expect(restored?.workspace.activeTabId).toBe("dirty");
    expect(restored?.workspace.tabs.map(({ id, session }) => [id, session.path, session.dirty]))
      .toEqual([
        ["dirty", null, true],
        ["new", missing.path, false],
        ["untitled", null, false],
      ]);
  });

  it("discards an incomplete snapshot without a recoverable body", async () => {
    const restored = await restoreWorkspaceFromSwap({
      version: 1, savedAt: 1, openMode: "tabs", activeTabId: "damaged",
      tabs: [{ id: "damaged", session: { ...dirty, content: undefined, savedContent: undefined } }],
    }, {
      claim: async () => null,
      release: vi.fn(),
      read: vi.fn(),
    });

    expect(restored).toBeNull();
  });
});
