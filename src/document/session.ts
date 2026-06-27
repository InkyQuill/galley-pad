export type LineEnding = "lf" | "crlf";

export type FileReadResult = {
  path: string;
  content: string;
  lineEnding: LineEnding;
  lastModifiedAt: number | null;
};

export type FileWriteResult = {
  path: string;
  lineEnding: LineEnding;
  lastModifiedAt: number | null;
};

export type DocumentSession = {
  id: string;
  path: string | null;
  displayName: string;
  content: string;
  savedContent: string;
  dirty: boolean;
  lineEnding: LineEnding;
  lastKnownModifiedAt: number | null;
};

export const INITIAL_DOCUMENT = "";

export function createUntitledSession(): DocumentSession {
  return {
    id: "untitled",
    path: null,
    displayName: "Untitled.md",
    content: INITIAL_DOCUMENT,
    savedContent: INITIAL_DOCUMENT,
    dirty: false,
    lineEnding: "lf",
    lastKnownModifiedAt: null,
  };
}

export function createSessionFromFile(file: FileReadResult): DocumentSession {
  return {
    id: `file:${file.path}`,
    path: file.path,
    displayName: displayNameFromPath(file.path),
    content: file.content,
    savedContent: file.content,
    dirty: false,
    lineEnding: file.lineEnding,
    lastKnownModifiedAt: file.lastModifiedAt,
  };
}

export function updateSessionContent(
  session: DocumentSession,
  content: string,
): DocumentSession {
  return {
    ...session,
    content,
    dirty: content !== session.savedContent,
  };
}

export function markSessionSaved(
  session: DocumentSession,
  result: FileWriteResult,
): DocumentSession {
  return {
    ...session,
    id: `file:${result.path}`,
    path: result.path,
    displayName: displayNameFromPath(result.path),
    savedContent: session.content,
    dirty: false,
    lineEnding: result.lineEnding,
    lastKnownModifiedAt: result.lastModifiedAt,
  };
}

function displayNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  const name = segments[segments.length - 1];
  return name && name.trim() ? name : "Untitled.md";
}
