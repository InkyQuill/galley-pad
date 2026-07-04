import { describe, expect, it } from "vitest";
import {
  applyExternalFileReload,
  createSessionFromFile,
  createUntitledSession,
  markExternalUpdateNoticed,
  markSessionSaved,
  normalizeExternalUpdateRuntimeState,
  resetExternalUpdateRuntimeState,
  setExternalUpdatePolicy,
  updateSessionContent,
} from "./session";

describe("document session model", () => {
  it("creates a clean untitled Markdown session", () => {
    const session = createUntitledSession();

    expect(session).toEqual({
      id: "untitled",
      path: null,
      displayName: "Untitled.md",
      content: "",
      savedContent: "",
      dirty: false,
      lineEnding: "lf",
      lastKnownModifiedAt: null,
      externalUpdatePolicy: "ask",
      lastNoticedExternalModifiedAt: null,
    });
  });

  it("creates a clean session from a file result", () => {
    const session = createSessionFromFile({
      path: "/tmp/notes/example.md",
      content: "# Example\r\n\r\nBody\r\n",
      lineEnding: "crlf",
      lastModifiedAt: 1_765_000_000_000,
    });

    expect(session.id).toBe("file:/tmp/notes/example.md");
    expect(session.path).toBe("/tmp/notes/example.md");
    expect(session.displayName).toBe("example.md");
    expect(session.content).toBe("# Example\r\n\r\nBody\r\n");
    expect(session.savedContent).toBe("# Example\r\n\r\nBody\r\n");
    expect(session.dirty).toBe(false);
    expect(session.lineEnding).toBe("crlf");
    expect(session.lastKnownModifiedAt).toBe(1_765_000_000_000);
    expect(session.externalUpdatePolicy).toBe("ask");
    expect(session.lastNoticedExternalModifiedAt).toBeNull();
  });

  it("handles Windows paths when deriving the display name", () => {
    const session = createSessionFromFile({
      path: "C:\\Users\\Inky\\draft.md",
      content: "# Draft\n",
      lineEnding: "lf",
      lastModifiedAt: null,
    });

    expect(session.displayName).toBe("draft.md");
  });

  it("marks a session dirty only when content differs from saved content", () => {
    const session = createUntitledSession();

    const dirty = updateSessionContent(session, "Changed");
    expect(dirty.dirty).toBe(true);
    expect(dirty.content).toBe("Changed");

    const clean = updateSessionContent(dirty, session.savedContent);
    expect(clean.dirty).toBe(false);
    expect(clean.content).toBe(session.savedContent);
  });

  it("marks a session clean after saving", () => {
    const session = updateSessionContent(createUntitledSession(), "Saved text\n");

    const saved = markSessionSaved(session, {
      path: "/tmp/Saved.md",
      lineEnding: "lf",
      lastModifiedAt: 1_765_000_001_000,
    });

    expect(saved.id).toBe("file:/tmp/Saved.md");
    expect(saved.path).toBe("/tmp/Saved.md");
    expect(saved.displayName).toBe("Saved.md");
    expect(saved.savedContent).toBe("Saved text\n");
    expect(saved.dirty).toBe(false);
    expect(saved.lastKnownModifiedAt).toBe(1_765_000_001_000);
    expect(saved.externalUpdatePolicy).toBe("ask");
    expect(saved.lastNoticedExternalModifiedAt).toBeNull();
  });

  it("manages external update runtime state", () => {
    const session = createSessionFromFile({
      path: "/tmp/notes.md",
      content: "Original\n",
      lineEnding: "lf",
      lastModifiedAt: 10,
    });

    const following = setExternalUpdatePolicy(session, "follow");
    expect(following.externalUpdatePolicy).toBe("follow");

    const noticed = markExternalUpdateNoticed(following, 12);
    expect(noticed.lastNoticedExternalModifiedAt).toBe(12);

    const reloaded = applyExternalFileReload(noticed, {
      path: "/tmp/notes.md",
      content: "External\n",
      lineEnding: "crlf",
      lastModifiedAt: 14,
    });
    expect(reloaded).toMatchObject({
      id: "file:/tmp/notes.md",
      path: "/tmp/notes.md",
      displayName: "notes.md",
      content: "External\n",
      savedContent: "External\n",
      dirty: false,
      lineEnding: "crlf",
      lastKnownModifiedAt: 14,
      externalUpdatePolicy: "follow",
      lastNoticedExternalModifiedAt: null,
    });

    expect(resetExternalUpdateRuntimeState(reloaded)).toMatchObject({
      externalUpdatePolicy: "ask",
      lastNoticedExternalModifiedAt: null,
    });
  });

  it("normalizes missing external update runtime state", () => {
    const legacySession = {
      id: "file:/tmp/legacy.md",
      path: "/tmp/legacy.md",
      displayName: "legacy.md",
      content: "Dirty legacy\n",
      savedContent: "",
      dirty: true,
      lineEnding: "lf" as const,
      lastKnownModifiedAt: 20,
    };

    expect(normalizeExternalUpdateRuntimeState(legacySession)).toMatchObject({
      externalUpdatePolicy: "ask",
      lastNoticedExternalModifiedAt: null,
    });
  });
});
