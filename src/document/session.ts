export type LineEnding = "lf" | "crlf";
export type TextEncoding = "utf8" | "utf8Bom" | "utf16Le" | "utf16Be" | "windows1251";
export type ExternalUpdatePolicy = "ask" | "follow";

export type FileReadResult = {
  path: string;
  content: string;
  exists?: boolean;
  encoding?: TextEncoding;
  lineEnding: LineEnding;
  lastModifiedAt: number | null;
};

export type FileWriteResult = {
  path: string;
  encoding?: TextEncoding;
  lineEnding: LineEnding;
  lastModifiedAt: number | null;
};

export type FileWriteOptions = {
  encoding: TextEncoding;
  expected:
    | { kind: "missing" }
    | { kind: "present"; content: string; encoding: TextEncoding };
  tabId?: string;
};

export type DocumentSession = {
  id: string;
  path: string | null;
  displayName: string;
  content: string;
  savedContent: string;
  dirty: boolean;
  fileExists?: boolean;
  encoding?: TextEncoding;
  savedDiskContent?: string;
  lineEnding: LineEnding;
  lastKnownModifiedAt: number | null;
  externalUpdatePolicy: ExternalUpdatePolicy;
  lastNoticedExternalModifiedAt: number | null;
  lastNoticedExternalContent?: { content: string; encoding?: TextEncoding };
  acknowledgedDeletedPath: string | null;
};

export const INITIAL_DOCUMENT = "";

const EXTERNAL_UPDATE_RUNTIME_DEFAULTS = {
  externalUpdatePolicy: "ask" as const,
  lastNoticedExternalModifiedAt: null,
  acknowledgedDeletedPath: null,
} satisfies Pick<
  DocumentSession,
  | "externalUpdatePolicy"
  | "lastNoticedExternalModifiedAt"
  | "acknowledgedDeletedPath"
>;

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
    ...EXTERNAL_UPDATE_RUNTIME_DEFAULTS,
  };
}

export function fileExists(file: FileReadResult): boolean {
  return file.exists ?? file.lastModifiedAt !== null;
}

export function createSessionFromFile(file: FileReadResult): DocumentSession {
  return {
    id: `file:${file.path}`,
    path: file.path,
    displayName: displayNameFromPath(file.path),
    content: file.content,
    savedContent: file.content,
    dirty: false,
    ...(file.exists !== undefined || !fileExists(file) ? { fileExists: fileExists(file) } : {}),
    ...(file.encoding !== undefined ? { encoding: file.encoding } : {}),
    lineEnding: file.lineEnding,
    lastKnownModifiedAt: file.lastModifiedAt,
    ...EXTERNAL_UPDATE_RUNTIME_DEFAULTS,
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
  diskContent = session.content,
): DocumentSession {
  return {
    ...session,
    id: `file:${result.path}`,
    path: result.path,
    displayName: displayNameFromPath(result.path),
    savedContent: session.content,
    dirty: false,
    ...(session.fileExists !== undefined || result.encoding !== undefined ? { fileExists: true } : {}),
    ...(result.encoding !== undefined ? { encoding: result.encoding } : {}),
    ...(diskContent !== session.content || session.savedDiskContent !== undefined
      ? { savedDiskContent: diskContent === session.content ? undefined : diskContent }
      : {}),
    lineEnding: result.lineEnding,
    lastKnownModifiedAt: result.lastModifiedAt,
    lastNoticedExternalModifiedAt: null,
    ...(session.lastNoticedExternalContent !== undefined ? { lastNoticedExternalContent: undefined } : {}),
    acknowledgedDeletedPath: null,
  };
}

export function setExternalUpdatePolicy(
  session: DocumentSession,
  externalUpdatePolicy: ExternalUpdatePolicy,
): DocumentSession {
  return { ...session, externalUpdatePolicy };
}

export function markExternalUpdateNoticed(
  session: DocumentSession,
  lastNoticedExternalModifiedAt: number | null,
  file?: FileReadResult,
): DocumentSession {
  return {
    ...session,
    lastNoticedExternalModifiedAt,
    ...(file ? { lastNoticedExternalContent: { content: file.content, encoding: file.encoding } } : {}),
  };
}

export function markExternalDeletionAcknowledged(
  session: DocumentSession,
  acknowledgedDeletedPath: string | null,
): DocumentSession {
  return { ...session, acknowledgedDeletedPath };
}

export function applyExternalFileReload(
  session: DocumentSession,
  file: FileReadResult,
): DocumentSession {
  return {
    ...session,
    id: `file:${file.path}`,
    path: file.path,
    displayName: displayNameFromPath(file.path),
    content: file.content,
    savedContent: file.content,
    dirty: false,
    ...(file.exists !== undefined || session.fileExists !== undefined ? { fileExists: fileExists(file) } : {}),
    ...(file.encoding !== undefined ? { encoding: file.encoding } : {}),
    ...(session.savedDiskContent !== undefined ? { savedDiskContent: undefined } : {}),
    lineEnding: file.lineEnding,
    lastKnownModifiedAt: file.lastModifiedAt,
    lastNoticedExternalModifiedAt: null,
    ...(session.lastNoticedExternalContent !== undefined ? { lastNoticedExternalContent: undefined } : {}),
    acknowledgedDeletedPath: null,
  };
}

export function resetExternalUpdateRuntimeState(
  session: DocumentSession,
): DocumentSession {
  return {
    ...session,
    ...EXTERNAL_UPDATE_RUNTIME_DEFAULTS,
  };
}

export function normalizeExternalUpdateRuntimeState(
  session: Omit<
    DocumentSession,
    | "externalUpdatePolicy"
    | "lastNoticedExternalModifiedAt"
    | "acknowledgedDeletedPath"
  > &
    Partial<
      Pick<
        DocumentSession,
        "externalUpdatePolicy" | "lastNoticedExternalModifiedAt" | "acknowledgedDeletedPath"
      >
    >,
): DocumentSession {
  return {
    ...session,
    ...EXTERNAL_UPDATE_RUNTIME_DEFAULTS,
    ...(session.lastNoticedExternalContent !== undefined ? { lastNoticedExternalContent: undefined } : {}),
  };
}

function displayNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  const name = segments[segments.length - 1];
  return name && name.trim() ? name : "Untitled.md";
}
