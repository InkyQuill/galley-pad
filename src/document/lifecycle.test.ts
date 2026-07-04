import { describe, expect, it, vi } from "vitest";
import {
  createSessionFromFile,
  createUntitledSession,
  updateSessionContent,
} from "./session";
import {
  checkExternalFileChange,
  ExternalFileChangedError,
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

  it("opens a missing file path as an empty clean file-backed session", async () => {
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

    await expect(openDocumentPath("/tmp/new-draft.md", deps)).resolves.toMatchObject({
      id: "file:/tmp/new-draft.md",
      path: "/tmp/new-draft.md",
      displayName: "new-draft.md",
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
    );
  });

  it("routes Save for untitled documents through Save As", async () => {
    const session = updateSessionContent(createUntitledSession(), "# Saved\n");
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn().mockResolvedValue("/tmp/new.md"),
      readTextFile: vi.fn(),
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

  it("reports same when a file-backed session has the same modified time", async () => {
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
      kind: "same",
    });
  });

  it("reports changed with the incoming file when modified time differs", async () => {
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
      kind: "changed",
      external,
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
      path: "/tmp/deleted.md",
    });
  });

  it("reports same without reading for untitled sessions and sessions without prior modified time", async () => {
    const untitledDeps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(),
    });
    await expect(
      checkExternalFileChange(createUntitledSession(), untitledDeps),
    ).resolves.toEqual({ kind: "same" });
    expect(untitledDeps.readTextFile).not.toHaveBeenCalled();

    const noKnownMtime = createSessionFromFile({
      path: "/tmp/no-known-mtime.md",
      content: "Base\n",
      lineEnding: "lf",
      lastModifiedAt: null,
    });
    const noKnownMtimeDeps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(),
    });

    await expect(
      checkExternalFileChange(noKnownMtime, noKnownMtimeDeps),
    ).resolves.toEqual({ kind: "same" });
    expect(noKnownMtimeDeps.readTextFile).not.toHaveBeenCalled();
  });
});
