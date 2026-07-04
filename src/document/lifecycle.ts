import {
  createSessionFromFile,
  createUntitledSession,
  markSessionSaved,
  type DocumentSession,
  type FileReadResult,
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

export type LifecycleDependencies = {
  pickOpenFile: () => Promise<string | null>;
  pickSaveFile: (defaultPath: string | null) => Promise<string | null>;
  readTextFile: (path: string) => Promise<FileReadResult>;
  writeTextFile: (
    path: string,
    content: string,
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
): Promise<DocumentSession> {
  return createSessionFromFile(await dependencies.readTextFile(path));
}

export async function saveDocument(
  session: DocumentSession,
  dependencies: LifecycleDependencies,
): Promise<DocumentSession | null> {
  if (!session.path) {
    return saveDocumentAs(session, dependencies);
  }

  await assertFileUnchanged(session, dependencies);

  return markSessionSaved(
    session,
    await dependencies.writeTextFile(session.path, session.content),
  );
}

export async function saveDocumentAs(
  session: DocumentSession,
  dependencies: LifecycleDependencies,
): Promise<DocumentSession | null> {
  const path = await dependencies.pickSaveFile(session.path ?? session.displayName);
  if (!path) {
    return null;
  }

  return markSessionSaved(
    session,
    await dependencies.writeTextFile(path, session.content),
  );
}

export async function checkExternalFileChange(
  session: DocumentSession,
  dependencies: LifecycleDependencies,
): Promise<ExternalFileChangeResult> {
  if (!session.path || session.lastKnownModifiedAt === null) {
    return { kind: "unchanged" };
  }

  const external = await dependencies.readTextFile(session.path);
  if (external.lastModifiedAt === null) {
    if (session.acknowledgedDeletedPath === session.path) {
      return { kind: "unchanged" };
    }

    return { kind: "deleted", session, path: session.path };
  }

  if (
    external.lastModifiedAt === session.lastKnownModifiedAt ||
    external.lastModifiedAt === session.lastNoticedExternalModifiedAt
  ) {
    return { kind: "unchanged" };
  }

  if (external.content === session.savedContent) {
    return {
      kind: "metadata-refresh",
      session: {
        ...session,
        lineEnding: external.lineEnding,
        lastKnownModifiedAt: external.lastModifiedAt,
        lastNoticedExternalModifiedAt: null,
      },
    };
  }

  if (external.content === session.content) {
    return {
      kind: "metadata-refresh",
      session: {
        ...session,
        savedContent: external.content,
        dirty: false,
        lineEnding: external.lineEnding,
        lastKnownModifiedAt: external.lastModifiedAt,
        lastNoticedExternalModifiedAt: null,
      },
    };
  }

  if (!session.dirty) {
    return { kind: "clean-update", session, external };
  }

  return {
    kind: "conflict",
    session,
    external,
    base: session.savedContent,
    local: session.content,
  };
}

async function assertFileUnchanged(
  session: DocumentSession,
  dependencies: LifecycleDependencies,
): Promise<void> {
  if (!session.path || session.lastKnownModifiedAt === null) {
    return;
  }

  const current = await dependencies.readTextFile(session.path);
  if (current.lastModifiedAt === null) {
    throw new ExternalFileChangedError(session.path);
  }

  if (current.content === session.savedContent) {
    return;
  }

  if (current.lastModifiedAt !== session.lastKnownModifiedAt) {
    throw new ExternalFileChangedError(session.path);
  }
}
