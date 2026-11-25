import { describe, expect, it, vi } from "vitest";
import {
  createSessionFromFile,
  createUntitledSession,
  markExternalDeletionAcknowledged,
  updateSessionContent,
} from "./session";
import {
  checkExternalFileChange,
  ExternalFileChangedError,
  FileNotFoundError,
  createLifecycleDependencies,
  newDocument,
  openDocument,
  openDocumentPath,
  saveDocument,
  saveDocumentAs,
} from "./lifecycle";

describe("document lifecycle commands", () => {
  it("creates a fresh untitled document", () => {
    const dirty = updateSessionContent(createUntitledSession(), "Changed");

    expect(newDocument(dirty)).toMatchObject({
      id: "untitled",
      path: null,
      displayName: "Untitled.md",
      dirty: false,
    });
  });

  it("opens a selected file as a clean document session", async () => {
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn().mockResolvedValue("/tmp/opened.md"),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/opened.md",
        content: "# Opened\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(openDocument(deps)).resolves.toMatchObject({
      id: "file:/tmp/opened.md",
      path: "/tmp/opened.md",
      displayName: "opened.md",
      content: "# Opened\n",
      savedContent: "# Opened\n",
      dirty: false,
      lastKnownModifiedAt: 10,
    });
  });

  it("keeps the current session when Open is cancelled", async () => {
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn().mockResolvedValue(null),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(),
    });

    await expect(openDocument(deps)).resolves.toBeNull();
    expect(deps.readTextFile).not.toHaveBeenCalled();
  });

  it("only allows missing paths as new documents for explicit creation", async () => {
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/new-draft.md",
        content: "",
        lineEnding: "lf",
        lastModifiedAt: null,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(openDocumentPath("/tmp/new-draft.md", deps)).rejects.toBeInstanceOf(FileNotFoundError);
    await expect(openDocumentPath("/tmp/new-draft.md", deps, { allowMissing: true })).resolves.toMatchObject({
      id: "file:/tmp/new-draft.md",
      path: "/tmp/new-draft.md",
      displayName: "new-draft.md",
      fileExists: false,
      content: "",
      savedContent: "",
      dirty: false,
      lastKnownModifiedAt: null,
    });
    expect(deps.readTextFile).toHaveBeenCalledWith("/tmp/new-draft.md");
  });

  it("saves a file-backed document when the file has not changed externally", async () => {
    const session = updateSessionContent(
      createSessionFromFile({
        path: "/tmp/draft.md",
        content: "# Draft\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      }),
      "# Draft\n\nUpdated.\n",
    );
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/draft.md",
        content: "# Draft\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      }),
      writeTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/draft.md",
        lineEnding: "lf",
        lastModifiedAt: 11,
      }),
    });

    await expect(saveDocument(session, deps)).resolves.toMatchObject({
      path: "/tmp/draft.md",
      savedContent: "# Draft\n\nUpdated.\n",
      dirty: false,
      lastKnownModifiedAt: 11,
    });
    expect(deps.writeTextFile).toHaveBeenCalledWith(
      "/tmp/draft.md",
      "# Draft\n\nUpdated.\n",
      { encoding: "utf8", expected: { kind: "present", content: "# Draft\n", encoding: "utf8" } },
    );
  });

  it("routes Save for untitled documents through Save As", async () => {
    const session = updateSessionContent(createUntitledSession(), "# Saved\n");
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn().mockResolvedValue("/tmp/new.md"),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/new.md", content: "", exists: false, lineEnding: "lf", lastModifiedAt: null,
      }),
      writeTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/new.md",
        lineEnding: "lf",
        lastModifiedAt: 20,
      }),
    });

    await expect(saveDocument(session, deps)).resolves.toMatchObject({
      path: "/tmp/new.md",
      displayName: "new.md",
      dirty: false,
    });
    expect(deps.pickSaveFile).toHaveBeenCalledWith("Untitled.md");
  });

  it("returns null when Save As is cancelled", async () => {
    const session = updateSessionContent(createUntitledSession(), "# Unsaved\n");
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn().mockResolvedValue(null),
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(),
    });

    await expect(saveDocumentAs(session, deps)).resolves.toBeNull();
    expect(deps.writeTextFile).not.toHaveBeenCalled();
  });

  it("blocks Save when the file changed on disk after it was opened", async () => {
    const session = updateSessionContent(
      createSessionFromFile({
        path: "/tmp/conflict.md",
        content: "# Original\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      }),
      "# Local edit\n",
    );
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/conflict.md",
        content: "# External edit\n",
        lineEnding: "lf",
        lastModifiedAt: 12,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(saveDocument(session, deps)).rejects.toBeInstanceOf(
      ExternalFileChangedError,
    );
    expect(deps.writeTextFile).not.toHaveBeenCalled();
  });

  it("detects and refuses to overwrite different disk content at the same mtime", async () => {
    const session = updateSessionContent(createSessionFromFile({
      path: "/tmp/same-time.md", content: "Base", lineEnding: "lf", lastModifiedAt: 10,
    }), "Local");
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/same-time.md", content: "External", lineEnding: "lf", lastModifiedAt: 10,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(checkExternalFileChange(session, deps)).resolves.toMatchObject({
      kind: "conflict", base: "Base", local: "Local",
    });
    await expect(saveDocument(session, deps)).rejects.toBeInstanceOf(ExternalFileChangedError);
    expect(deps.writeTextFile).not.toHaveBeenCalled();
  });

  it("preserves the original encoding and line endings when saving", async () => {
    const original = {
      path: "/tmp/utf16.md", content: "Base\r\n", exists: true,
      lineEnding: "crlf", encoding: "utf16Le", lastModifiedAt: null,
    } as const;
    const session = updateSessionContent(createSessionFromFile(original), "Local\n");
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue(original),
      writeTextFile: vi.fn().mockResolvedValue({
        path: original.path, lineEnding: "crlf", encoding: "utf16Le", lastModifiedAt: null,
      }),
    });

    await expect(saveDocument(session, deps, "tab-1")).resolves.toMatchObject({
      dirty: false, fileExists: true, savedContent: "Local\n", savedDiskContent: "Local\r\n", encoding: "utf16Le",
    });
    expect(deps.writeTextFile).toHaveBeenCalledWith(original.path, "Local\r\n", {
      tabId: "tab-1", encoding: "utf16Le",
      expected: { kind: "present", content: "Base\r\n", encoding: "utf16Le" },
    });
  });

  it("blocks Save when the file was deleted on disk after it was opened", async () => {
    const session = updateSessionContent(
      createSessionFromFile({
        path: "/tmp/deleted-save.md",
        content: "# Original\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      }),
      "# Local edit\n",
    );
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/deleted-save.md",
        content: "",
        lineEnding: "lf",
        lastModifiedAt: null,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(saveDocument(session, deps)).rejects.toBeInstanceOf(
      ExternalFileChangedError,
    );
    expect(deps.writeTextFile).not.toHaveBeenCalled();
  });

  it("blocks Save when a file appears at a path with unknown modified time", async () => {
    const session = updateSessionContent(
      createSessionFromFile({
        path: "/tmp/created-elsewhere.md",
        content: "",
        lineEnding: "lf",
        lastModifiedAt: null,
      }),
      "# Local edit\n",
    );
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/created-elsewhere.md",
        content: "# External edit\n",
        lineEnding: "lf",
        lastModifiedAt: 12,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(saveDocument(session, deps)).rejects.toBeInstanceOf(
      ExternalFileChangedError,
    );
    expect(deps.writeTextFile).not.toHaveBeenCalled();
  });

  it("saves to recreate a deleted file after the deletion is acknowledged", async () => {
    const session = markExternalDeletionAcknowledged(
      updateSessionContent(
        createSessionFromFile({
          path: "/tmp/acknowledged-deleted-save.md",
          content: "# Original\n",
          lineEnding: "lf",
          lastModifiedAt: 10,
        }),
        "# Local edit\n",
      ),
      "/tmp/acknowledged-deleted-save.md",
    );
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/acknowledged-deleted-save.md",
        content: "",
        lineEnding: "lf",
        lastModifiedAt: null,
      }),
      writeTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/acknowledged-deleted-save.md",
        lineEnding: "lf",
        lastModifiedAt: 12,
      }),
    });

    await expect(saveDocument(session, deps)).resolves.toMatchObject({
      path: "/tmp/acknowledged-deleted-save.md",
      savedContent: "# Local edit\n",
      dirty: false,
      lastKnownModifiedAt: 12,
      acknowledgedDeletedPath: null,
    });
    expect(deps.pickSaveFile).not.toHaveBeenCalled();
    expect(deps.writeTextFile).toHaveBeenCalledWith(
      "/tmp/acknowledged-deleted-save.md",
      "# Local edit\n",
      { encoding: "utf8", expected: { kind: "missing" } },
    );
  });

  it("does not block Save when only file metadata changed on disk", async () => {
    const session = updateSessionContent(
      createSessionFromFile({
        path: "/tmp/metadata-save.md",
        content: "# Draft\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      }),
      "# Draft\n\nUpdated.\n",
    );
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/metadata-save.md",
        content: "# Draft\n",
        lineEnding: "crlf",
        lastModifiedAt: 12,
      }),
      writeTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/metadata-save.md",
        lineEnding: "lf",
        lastModifiedAt: 13,
      }),
    });

    await expect(saveDocument(session, deps)).resolves.toMatchObject({
      path: "/tmp/metadata-save.md",
      savedContent: "# Draft\n\nUpdated.\n",
      dirty: false,
      lastKnownModifiedAt: 13,
    });
    expect(deps.writeTextFile).toHaveBeenCalledWith(
      "/tmp/metadata-save.md",
      "# Draft\n\nUpdated.\n",
      { encoding: "utf8", expected: { kind: "present", content: "# Draft\n", encoding: "utf8" } },
    );
  });

  it("reports unchanged when a file-backed session has the same modified time", async () => {
    const session = createSessionFromFile({
      path: "/tmp/same.md",
      content: "Base\n",
      lineEnding: "lf",
      lastModifiedAt: 10,
    });
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/same.md",
        content: "Base\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(checkExternalFileChange(session, deps)).resolves.toEqual({
      kind: "unchanged",
    });
  });

  it("reports clean external updates and dirty conflicts", async () => {
    const session = createSessionFromFile({
      path: "/tmp/changed.md",
      content: "Base\n",
      lineEnding: "lf",
      lastModifiedAt: 10,
    });
    const external = {
      path: "/tmp/changed.md",
      content: "External\n",
      lineEnding: "lf" as const,
      lastModifiedAt: 12,
    };
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue(external),
      writeTextFile: vi.fn(),
    });

    await expect(checkExternalFileChange(session, deps)).resolves.toEqual({
      kind: "clean-update",
      session,
      external,
    });

    const dirty = updateSessionContent(session, "Local\n");
    const conflictDeps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue(external),
      writeTextFile: vi.fn(),
    });

    await expect(checkExternalFileChange(dirty, conflictDeps)).resolves.toEqual({
      kind: "conflict",
      session: dirty,
      external,
      base: "Base\n",
      local: "Local\n",
    });
  });

  it("reports deleted when a previously known file now has no modified time", async () => {
    const session = createSessionFromFile({
      path: "/tmp/deleted.md",
      content: "Base\n",
      lineEnding: "lf",
      lastModifiedAt: 10,
    });
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/deleted.md",
        content: "",
        lineEnding: "lf",
        lastModifiedAt: null,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(checkExternalFileChange(session, deps)).resolves.toEqual({
      kind: "deleted",
      session,
      path: "/tmp/deleted.md",
    });
  });

  it("does not repeat a deleted warning after the deletion is acknowledged", async () => {
    const session = {
      ...createSessionFromFile({
        path: "/tmp/deleted.md",
        content: "Base\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      }),
      acknowledgedDeletedPath: "/tmp/deleted.md",
    };
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/deleted.md",
        content: "",
        lineEnding: "lf",
        lastModifiedAt: null,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(checkExternalFileChange(session, deps)).resolves.toEqual({
      kind: "unchanged",
    });
  });

  it("clears acknowledged deletion when a recreated file has the same timestamp", async () => {
    const path = "/tmp/recreated-same-time.md";
    const session = markExternalDeletionAcknowledged(
      createSessionFromFile({
        path,
        content: "Base\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      }),
      path,
    );
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path,
        content: "Base\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(checkExternalFileChange(session, deps)).resolves.toEqual({
      kind: "metadata-refresh",
      session: {
        ...session,
        lastNoticedExternalModifiedAt: null,
        acknowledgedDeletedPath: null,
      },
    });
  });

  it("reports a later deletion after an acknowledged deleted file is recreated", async () => {
    const path = "/tmp/recreated.md";
    const session = createSessionFromFile({
      path,
      content: "Base\n",
      lineEnding: "lf",
      lastModifiedAt: 10,
    });
    const deletedDeps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path,
        content: "",
        lineEnding: "lf",
        lastModifiedAt: null,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(checkExternalFileChange(session, deletedDeps)).resolves.toEqual({
      kind: "deleted",
      session,
      path,
    });

    const acknowledged = markExternalDeletionAcknowledged(session, path);
    const recreatedDeps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path,
        content: "Base\n",
        lineEnding: "lf",
        lastModifiedAt: 12,
      }),
      writeTextFile: vi.fn(),
    });
    const recreated = await checkExternalFileChange(acknowledged, recreatedDeps);

    expect(recreated).toEqual({
      kind: "metadata-refresh",
      session: {
        ...acknowledged,
        lastKnownModifiedAt: 12,
        lastNoticedExternalModifiedAt: null,
        acknowledgedDeletedPath: null,
      },
    });
    if (recreated.kind !== "metadata-refresh") {
      throw new Error(`Expected metadata-refresh, received ${recreated.kind}`);
    }

    const deletedAgainDeps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path,
        content: "",
        lineEnding: "lf",
        lastModifiedAt: null,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(
      checkExternalFileChange(recreated.session, deletedAgainDeps),
    ).resolves.toEqual({
      kind: "deleted",
      session: recreated.session,
      path,
    });
  });

  it("clears acknowledged deletion when a recreated file has different content", async () => {
    const path = "/tmp/recreated-different.md";
    const session = createSessionFromFile({
      path,
      content: "Base\n",
      lineEnding: "lf",
      lastModifiedAt: 10,
    });
    const acknowledged = markExternalDeletionAcknowledged(session, path);
    const external = {
      path,
      content: "External\n",
      lineEnding: "lf" as const,
      lastModifiedAt: 12,
    };
    const cleanUpdateDeps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue(external),
      writeTextFile: vi.fn(),
    });

    const cleanUpdate = await checkExternalFileChange(
      acknowledged,
      cleanUpdateDeps,
    );

    expect(cleanUpdate).toMatchObject({
      kind: "clean-update",
      session: {
        acknowledgedDeletedPath: null,
      },
      external,
    });
    if (cleanUpdate.kind !== "clean-update") {
      throw new Error(`Expected clean-update, received ${cleanUpdate.kind}`);
    }

    const deletedAgainDeps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path,
        content: "",
        lineEnding: "lf",
        lastModifiedAt: null,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(
      checkExternalFileChange(cleanUpdate.session, deletedAgainDeps),
    ).resolves.toEqual({
      kind: "deleted",
      session: cleanUpdate.session,
      path,
    });

    const dirty = markExternalDeletionAcknowledged(
      updateSessionContent(session, "Local\n"),
      path,
    );
    const conflictDeps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue(external),
      writeTextFile: vi.fn(),
    });

    await expect(
      checkExternalFileChange(dirty, conflictDeps),
    ).resolves.toMatchObject({
      kind: "conflict",
      session: {
        acknowledgedDeletedPath: null,
      },
      external,
      base: "Base\n",
      local: "Local\n",
    });
  });

  it("refreshes metadata when the content is unchanged", async () => {
    const session = createSessionFromFile({
      path: "/tmp/metadata.md",
      content: "Base\n",
      lineEnding: "lf",
      lastModifiedAt: 10,
    });
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/metadata.md",
        content: "Base\n",
        lineEnding: "crlf",
        lastModifiedAt: 12,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(checkExternalFileChange(session, deps)).resolves.toEqual({
      kind: "metadata-refresh",
      session: {
        ...session,
        lineEnding: "crlf",
        lastKnownModifiedAt: 12,
        lastNoticedExternalModifiedAt: null,
      },
    });
  });

  it("refreshes metadata when dirty local content already matches disk", async () => {
    const session = updateSessionContent(
      createSessionFromFile({
        path: "/tmp/local-matches-disk.md",
        content: "Base\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      }),
      "External\n",
    );
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/local-matches-disk.md",
        content: "External\n",
        lineEnding: "crlf",
        lastModifiedAt: 12,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(checkExternalFileChange(session, deps)).resolves.toEqual({
      kind: "metadata-refresh",
      session: {
        ...session,
        savedContent: "External\n",
        dirty: false,
        lineEnding: "crlf",
        lastKnownModifiedAt: 12,
        lastNoticedExternalModifiedAt: null,
      },
    });
  });

  it("ignores the noticed content, but detects different content with the same mtime", async () => {
    const session = {
      ...createSessionFromFile({
        path: "/tmp/noticed.md",
        content: "Base\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      }),
      lastNoticedExternalModifiedAt: 12,
      lastNoticedExternalContent: { content: "External\n" },
    };
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/noticed.md",
        content: "External\n",
        lineEnding: "lf",
        lastModifiedAt: 12,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(checkExternalFileChange(session, deps)).resolves.toEqual({
      kind: "unchanged",
    });
    vi.mocked(deps.readTextFile).mockResolvedValue({
      path: "/tmp/noticed.md", content: "External again\n", lineEnding: "lf", lastModifiedAt: 12,
    });
    await expect(checkExternalFileChange(session, deps)).resolves.toMatchObject({
      kind: "clean-update",
    });
  });

  it("reports unchanged without reading for untitled sessions", async () => {
    const untitledDeps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(),
    });
    await expect(
      checkExternalFileChange(createUntitledSession(), untitledDeps),
    ).resolves.toEqual({ kind: "unchanged" });
    expect(untitledDeps.readTextFile).not.toHaveBeenCalled();
  });

  it("reads path-backed sessions without prior modified time", async () => {
    const noKnownMtime = createSessionFromFile({
      path: "/tmp/no-known-mtime.md",
      content: "Base\n",
      lineEnding: "lf",
      lastModifiedAt: null,
    });
    const noKnownMtimeDeps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/no-known-mtime.md",
        content: "",
        lineEnding: "lf",
        lastModifiedAt: null,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(
      checkExternalFileChange(noKnownMtime, noKnownMtimeDeps),
    ).resolves.toEqual({ kind: "unchanged" });
    expect(noKnownMtimeDeps.readTextFile).toHaveBeenCalledWith(
      "/tmp/no-known-mtime.md",
    );
  });

  it("reports external content at a path with unknown modified time", async () => {
    const session = createSessionFromFile({
      path: "/tmp/no-known-mtime-created.md",
      content: "",
      lineEnding: "lf",
      lastModifiedAt: null,
    });
    const external = {
      path: "/tmp/no-known-mtime-created.md",
      content: "# External\n",
      lineEnding: "lf" as const,
      lastModifiedAt: 12,
    };
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue(external),
      writeTextFile: vi.fn(),
    });

    await expect(checkExternalFileChange(session, deps)).resolves.toEqual({
      kind: "clean-update",
      session,
      external,
    });
  });
});
