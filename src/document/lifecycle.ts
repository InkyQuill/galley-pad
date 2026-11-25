import { createSideBySideLineDiff } from "./diff";
import {
  createSessionFromFile,
  createUntitledSession,
  fileExists,
  markSessionSaved,
  type DocumentSession,
  type FileReadResult,
  type FileWriteOptions,
  type FileWriteResult,
} from "./session";

export class ExternalFileChangedError extends Error {
  constructor(path: string) {
    super(
      `The file changed on disk since it was opened: ${path}. Use Save As to avoid overwriting external changes.`,
    );
    this.name = "ExternalFileChangedError";
  }
}

export class FileNotFoundError extends Error {
  constructor(path: string) {
    super(`The file no longer exists: ${path}`);
    this.name = "FileNotFoundError";
  }
}

export class UnsupportedFileEncodingError extends Error {
  constructor(public readonly path: string, message: string) {
    super(message);
    this.name = "UnsupportedFileEncodingError";
  }
}

export type LifecycleDependencies = {
  pickOpenFile: () => Promise<string | null>;
  pickSaveFile: (defaultPath: string | null) => Promise<string | null>;
  readTextFile: (path: string, encoding?: "windows1251") => Promise<FileReadResult>;
  writeTextFile: (
    path: string,
    content: string,
    options: FileWriteOptions,
  ) => Promise<FileWriteResult>;
};

export type ExternalFileChangeResult =
  | { kind: "unchanged" }
  | { kind: "deleted"; session: DocumentSession; path: string }
  | { kind: "metadata-refresh"; session: DocumentSession }
  | { kind: "clean-update"; session: DocumentSession; external: FileReadResult }
  | {
      kind: "conflict";
      session: DocumentSession;
      external: FileReadResult;
      base: string;
      local: string;
    };

export function createLifecycleDependencies(
  dependencies: LifecycleDependencies,
): LifecycleDependencies {
  return dependencies;
}

export function newDocument(_current: DocumentSession): DocumentSession {
  return createUntitledSession();
}

export async function openDocument(
  dependencies: LifecycleDependencies,
): Promise<DocumentSession | null> {
  const path = await dependencies.pickOpenFile();
  if (!path) {
    return null;
  }

  return openDocumentPath(path, dependencies);
}

export async function openDocumentPath(
  path: string,
  dependencies: LifecycleDependencies,
  { allowMissing = false, encoding }: { allowMissing?: boolean; encoding?: "windows1251" } = {},
): Promise<DocumentSession> {
  const file = encoding
    ? await dependencies.readTextFile(path, encoding)
    : await dependencies.readTextFile(path);
  if (!allowMissing && !fileExists(file)) {
    throw new FileNotFoundError(path);
  }
  return createSessionFromFile(file);
}

export async function saveDocument(
  session: DocumentSession,
  dependencies: LifecycleDependencies,
  tabId?: string,
): Promise<DocumentSession | null> {
  if (!session.path) {
    return saveDocumentAs(session, dependencies, tabId);
  }

  const current = await readSessionFile(session.path, session, dependencies);
  if (!fileExists(current)) {
    if (
      session.fileExists !== false &&
      session.acknowledgedDeletedPath !== session.path
    ) {
      throw new ExternalFileChangedError(session.path);
    }
  } else if (session.fileExists === false || !matchesSavedContent(session, current)) {
    throw new ExternalFileChangedError(session.path);
  }

  return writeDocument(session, session.path, current, dependencies, tabId);
}

export async function saveDocumentAs(
  session: DocumentSession,
  dependencies: LifecycleDependencies,
  tabId?: string,
): Promise<DocumentSession | null> {
  const path = await dependencies.pickSaveFile(session.path ?? session.displayName);
  if (!path) {
    return null;
  }
  if (path === session.path) {
    return saveDocument(session, dependencies, tabId);
  }

  const current = await dependencies.readTextFile(path);
  return writeDocument(session, path, current, dependencies, tabId);
}

async function writeDocument(
  session: DocumentSession,
  path: string,
  current: FileReadResult,
  dependencies: LifecycleDependencies,
  tabId?: string,
): Promise<DocumentSession> {
  const content = contentWithSavedLineEndings(session);
  const options: FileWriteOptions = {
    encoding: session.encoding ?? "utf8",
    expected: fileExists(current)
      ? { kind: "present", content: current.content, encoding: current.encoding ?? "utf8" }
      : { kind: "missing" },
    ...(tabId ? { tabId } : {}),
  };

  try {
    const result = await dependencies.writeTextFile(path, content, options);
    return markSessionSaved(
      session,
      content.includes("\n") ? result : { ...result, lineEnding: session.lineEnding },
      content,
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && "kind" in error && error.kind === "conflict") {
      throw new ExternalFileChangedError(path);
    }
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
      throw error instanceof Error ? error : new Error(error.message);
    }
    throw error;
  }
}

function contentWithSavedLineEndings(session: DocumentSession): string {
  const normalized = session.content.replace(/\r\n/g, "\n");
  const snapshot = session.savedDiskContent ?? session.savedContent;
  const originalEndings: string[] = snapshot.match(/\r?\n/g) ?? [];
  const defaultEnding = session.lineEnding === "crlf" ? "\r\n" : "\n";
  if (!originalEndings.includes("\r\n") || !originalEndings.includes("\n")) {
    return normalized.replace(/\n/g, defaultEnding);
  }
  if (normalized === snapshot.replace(/\r\n/g, "\n")) return snapshot;

  const editedLines = normalized.split("\n");
  const editedEndings: string[] = editedLines.slice(1).map(() => defaultEnding);
  let originalLine = 0;
  let editedLine = 0;
  for (const { kind } of createSideBySideLineDiff(snapshot, normalized)) {
    if (kind === "unchanged" || kind === "changed") {
      const originalEnding = originalEndings[originalLine];
      if (originalEnding && editedLine < editedEndings.length) {
        editedEndings[editedLine] = originalEnding;
      }
    }
    if (kind !== "added") originalLine += 1;
    if (kind !== "removed") editedLine += 1;
  }
  return editedLines.map((line, index) => line + (editedEndings[index] ?? "")).join("");
}

export async function checkExternalFileChange(
  session: DocumentSession,
  dependencies: LifecycleDependencies,
  encoding?: "windows1251",
): Promise<ExternalFileChangeResult> {
  if (!session.path) {
    return { kind: "unchanged" };
  }

  const external = encoding
    ? await dependencies.readTextFile(session.path, encoding)
    : await readSessionFile(session.path, session, dependencies);
  if (!fileExists(external)) {
    if (
      (session.fileExists ?? (session.lastKnownModifiedAt !== null)) === false ||
      session.acknowledgedDeletedPath === session.path
    ) {
      return { kind: "unchanged" };
    }

    return { kind: "deleted", session, path: session.path };
  }

  const existingFileSession =
    session.acknowledgedDeletedPath === null
      ? session
      : { ...session, acknowledgedDeletedPath: null };
  const noticed = session.lastNoticedExternalContent;
  if (
    session.acknowledgedDeletedPath === null &&
    noticed?.content === external.content &&
    noticed.encoding === external.encoding
  ) {
    return { kind: "unchanged" };
  }

  if (matchesSavedContent(session, external)) {
    if (
      session.fileExists !== false &&
      existingFileSession === session &&
      noticed === undefined &&
      external.lastModifiedAt === session.lastKnownModifiedAt
    ) {
      return { kind: "unchanged" };
    }
    return {
      kind: "metadata-refresh",
      session: refreshDiskMetadata(existingFileSession, external),
    };
  }

  if (
    external.content === session.content &&
    (external.encoding ?? "utf8") === (session.encoding ?? "utf8")
  ) {
    return {
      kind: "metadata-refresh",
      session: {
        ...refreshDiskMetadata(existingFileSession, external),
        savedContent: external.content,
        ...(session.savedDiskContent !== undefined ? { savedDiskContent: undefined } : {}),
        dirty: false,
      },
    };
  }

  if (!session.dirty) {
    return {
      kind: "clean-update",
      session: existingFileSession,
      external,
    };
  }

  return {
    kind: "conflict",
    session: existingFileSession,
    external,
    base: session.savedContent,
    local: session.content,
  };
}

function readSessionFile(
  path: string,
  session: DocumentSession,
  dependencies: LifecycleDependencies,
): Promise<FileReadResult> {
  return session.encoding === "windows1251"
    ? dependencies.readTextFile(path, "windows1251")
    : dependencies.readTextFile(path);
}

function matchesSavedContent(session: DocumentSession, file: FileReadResult): boolean {
  return file.content === (session.savedDiskContent ?? session.savedContent) &&
    (file.encoding ?? "utf8") === (session.encoding ?? "utf8");
}

function refreshDiskMetadata(session: DocumentSession, file: FileReadResult): DocumentSession {
  return {
    ...session,
    ...(file.exists !== undefined || session.fileExists !== undefined ? { fileExists: true } : {}),
    lineEnding: file.lineEnding,
    lastKnownModifiedAt: file.lastModifiedAt,
    lastNoticedExternalModifiedAt: null,
    ...(session.lastNoticedExternalContent !== undefined ? { lastNoticedExternalContent: undefined } : {}),
  };
}
