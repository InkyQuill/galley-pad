import type { PersistedSwapState } from "../tauri/appPersistence";
import {
  createSessionFromFile,
  createUntitledSession,
  fileExists,
  normalizeExternalUpdateRuntimeState,
  type FileReadResult,
} from "./session";
import type { DocumentTab, DocumentWorkspace } from "./workspace";

type RecoveryDependencies = {
  claim(path: string, tabId: string): Promise<string | null>;
  release(tabId: string): Promise<void>;
  read(path: string, encoding?: "windows1251"): Promise<FileReadResult>;
};

export function createSwapState(workspace: DocumentWorkspace): PersistedSwapState | null {
  if (!workspace.tabs.some((tab) => tab.session.dirty)) return null;

  return {
    version: 1,
    savedAt: Date.now(),
    activeTabId: workspace.activeTabId,
    openMode: workspace.openMode,
    tabs: workspace.tabs.map(({ id, session }) => ({
      id,
      session: {
        id: session.id,
        path: session.path,
        displayName: session.displayName,
        dirty: session.dirty,
        lineEnding: session.lineEnding,
        lastKnownModifiedAt: session.lastKnownModifiedAt,
        fileExists: session.fileExists,
        encoding: session.encoding,
        ...(session.dirty ? {
          content: session.content,
          savedContent: session.savedContent,
          savedDiskContent: session.savedDiskContent,
        } : {}),
      },
    })),
  };
}

export async function restoreWorkspaceFromSwap(
  snapshot: PersistedSwapState,
  dependencies: RecoveryDependencies,
): Promise<{ workspace: DocumentWorkspace; unavailableCount: number } | null> {
  if (!snapshot.tabs.some(({ session }) => session.dirty)) return null;

  const results = await Promise.all(snapshot.tabs.map(async ({ id, session }): Promise<DocumentTab | null> => {
    const path = session.path
      ? await dependencies.claim(session.path, id).catch(() => null)
      : null;

    // Saved tabs are reloaded from disk so recovery cannot replace newer file content.
    if (!session.dirty && path) {
      try {
        const file = await dependencies.read(path, session.encoding === "windows1251" ? "windows1251" : undefined);
        if (fileExists(file)) return { id, session: createSessionFromFile(file) };
        if (session.fileExists === false) {
          // Preserve a deliberate CLI creation target that was never saved.
          return { id, session: createSessionFromFile(file) };
        }
      } catch {
        // An unreadable file must not block recovery of other tabs.
      }
      await dependencies.release(id).catch(() => undefined);
    }

    if (session.content !== undefined && session.savedContent !== undefined &&
        (session.dirty || session.content !== "")) {
      const backed = session.dirty && path !== null;
      return {
        id,
        session: normalizeExternalUpdateRuntimeState({
          ...session,
          path: backed ? path : null,
          id: backed ? session.id : "untitled",
          content: session.content,
          savedContent: session.dirty ? session.savedContent : "",
          dirty: true,
        }),
      };
    }

    if (!session.path && !session.dirty) {
      return {
        id,
        session: { ...createUntitledSession(), displayName: session.displayName },
      };
    }
    return null;
  }));

  const tabs = results.filter((tab) => tab !== null);
  if (!tabs.length) return null;
  return {
    workspace: {
      tabs,
      openMode: snapshot.openMode,
      activeTabId: tabs.some((tab) => tab.id === snapshot.activeTabId) ? snapshot.activeTabId : tabs[0].id,
    },
    unavailableCount: results.length - tabs.length,
  };
}
