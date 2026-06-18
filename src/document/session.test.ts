import { describe, expect, it } from "vitest";
import {
  createSessionFromFile,
  createUntitledSession,
  markSessionSaved,
  updateSessionContent,
} from "./session";

describe("document session model", () => {
  it("creates a clean untitled Markdown session", () => {
    const session = createUntitledSession();

    expect(session).toEqual({
      id: "untitled",
      path: null,
      displayName: "Untitled.md",
      content: "# Untitled\n\nStart writing Markdown.\n",
      savedContent: "# Untitled\n\nStart writing Markdown.\n",
      dirty: false,
      lineEnding: "lf",
      lastKnownModifiedAt: null,
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
  });
});
