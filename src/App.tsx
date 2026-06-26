import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentView } from "./components/DocumentView";
import {
  createLifecycleDependencies,
  openDocumentPath,
  openDocument,
  saveDocument,
  saveDocumentAs,
  type LifecycleDependencies,
} from "./document/lifecycle";
import {
  updateSessionContent,
  type DocumentSession,
} from "./document/session";
import {
  addDocumentTab,
  closeDocumentTab,
  createDocumentWorkspace,
  getActiveDocumentTab,
  openDocumentTab,
  setActiveDocumentTab,
  setOpenMode,
  updateActiveDocumentTab,
  updateDocumentTab,
  type DocumentWorkspace,
  type OpenMode,
} from "./document/workspace";
import { loadOpenMode, saveOpenMode } from "./settings/openMode";
import { pickOpenFile, pickSaveFile } from "./tauri/dialogs";
import {
  getPendingMarkdownFileOpen,
  getWindowMarkdownFileOpen,
  listenForMarkdownFileOpen,
} from "./tauri/externalFiles";
import { readTextFile, writeTextFile } from "./tauri/files";
import {
  listenForAppMenuCommand,
  type AppMenuCommand,
} from "./tauri/menuEvents";
import { openMarkdownFileWindow } from "./tauri/windows";

type CommandName = "Open" | "Save" | "Save As" | "Open File";

export default function App() {
  const [workspace, setWorkspace] = useState(() =>
    createDocumentWorkspace(loadOpenMode()),
  );
  const [pendingCommand, setPendingCommand] = useState<CommandName | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const latestWorkspace = useRef(workspace);
  const dependencies = useMemo<LifecycleDependencies>(
    () =>
      createLifecycleDependencies({
        pickOpenFile,
        pickSaveFile,
        readTextFile,
        writeTextFile,
      }),
    [],
  );

  latestWorkspace.current = workspace;
  const activeTab = getActiveDocumentTab(workspace);
  const document = activeTab.session;

  const wordCount = useMemo(() => {
    const words = document.content
      .trim()
      .split(/\s+/)
      .filter((word) => /[A-Za-z0-9]/.test(word));
    return words.length;
  }, [document.content]);

  useEffect(() => {
    globalThis.document.title = `${document.dirty ? "* " : ""}${
      document.displayName
    } - Galley Pad`;
  }, [document.dirty, document.displayName]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;

    void listenForMarkdownFileOpen((path) => {
      openExternalFile(path);
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
      } else {
        unlisten = nextUnlisten;
      }
    });

    const windowLaunchPath = getWindowMarkdownFileOpen();
    if (windowLaunchPath) {
      openFileInCurrentWindow(windowLaunchPath);
      return () => {
        disposed = true;
        unlisten?.();
      };
    }

    void getPendingMarkdownFileOpen()
      .then((path) => {
        if (path && !disposed) {
          openFileInCurrentWindow(path);
        }
      })
      .catch((error: unknown) => {
        setCommandError(errorMessage(error));
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;

    void listenForAppMenuCommand((command) => {
      runMenuCommand(command);
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
      } else {
        unlisten = nextUnlisten;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && key === "n") {
        event.preventDefault();
        addNewTab();
        return;
      }

      if (!event.shiftKey || key !== "t") {
        return;
      }

      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
        setToolbarVisible((visible) => !visible);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function addNewTab() {
    setCommandError(null);
    setWorkspace((current) => addDocumentTab(current));
  }

  function runOpenCommand(name: CommandName, command: () => Promise<DocumentSession | null>) {
    setCommandError(null);
    setPendingCommand(name);

    void command()
      .then((next) => {
        if (next) {
          setWorkspace((current) => openDocumentTab(current, next));
        }
      })
      .catch((error: unknown) => {
        setCommandError(errorMessage(error));
      })
      .finally(() => {
        setPendingCommand(null);
      });
  }

  function runOpenWindowCommand(name: CommandName, command: () => Promise<string | null>) {
    setCommandError(null);
    setPendingCommand(name);

    void command()
      .catch((error: unknown) => {
        setCommandError(errorMessage(error));
      })
      .finally(() => {
        setPendingCommand(null);
      });
  }

  function runSaveCommand(
    name: "Save" | "Save As",
    command: (session: DocumentSession) => Promise<DocumentSession | null>,
  ) {
    const tabId = latestWorkspace.current.activeTabId;
    const commandSnapshot = getActiveDocumentTab(latestWorkspace.current).session;

    setCommandError(null);
    setPendingCommand(name);

    void command(commandSnapshot)
      .then((next) => {
        if (next) {
          setWorkspace((current) =>
            updateDocumentTab(current, tabId, (currentSession) =>
              applySaveResult(commandSnapshot, next, currentSession),
            ),
          );
        }
      })
      .catch((error: unknown) => {
        setCommandError(errorMessage(error));
      })
      .finally(() => {
        setPendingCommand(null);
      });
  }

  function openExternalFile(path: string) {
    if (latestWorkspace.current.openMode === "windows") {
      runOpenWindowCommand("Open File", () => openMarkdownFileWindow(path));
      return;
    }

    runOpenCommand("Open File", () => openDocumentPath(path, dependencies));
  }

  function openFileInCurrentWindow(path: string) {
    runOpenCommand("Open File", () => openDocumentPath(path, dependencies));
  }

  function runMenuCommand(command: AppMenuCommand) {
    switch (command) {
      case "new":
        addNewTab();
        break;
      case "open":
        if (latestWorkspace.current.openMode === "windows") {
          runOpenWindowCommand("Open", async () => {
            const path = await dependencies.pickOpenFile();
            if (!path) {
              return null;
            }

            return openMarkdownFileWindow(path);
          });
        } else {
          runOpenCommand("Open", () => openDocument(dependencies));
        }
        break;
      case "save":
        runSaveCommand("Save", (session) => saveDocument(session, dependencies));
        break;
      case "save-as":
        runSaveCommand("Save As", (session) =>
          saveDocumentAs(session, dependencies),
        );
        break;
      case "settings":
        setSettingsOpen(true);
        break;
      case "toggle-toolbar":
        setToolbarVisible((visible) => !visible);
        break;
    }
  }

  function closeTab(tabId: string) {
    const tab = workspace.tabs.find((candidate) => candidate.id === tabId);
    if (!tab) {
      return;
    }

    const confirmed =
      !tab.session.dirty ||
      window.confirm(`Discard unsaved changes to ${tab.session.displayName}?`);
    const result = closeDocumentTab(workspace, tabId, confirmed);
    if (result.closed) {
      setWorkspace(result.workspace);
    }
  }

  function updateOpenMode(openMode: OpenMode) {
    saveOpenMode(openMode);
    setWorkspace((current) => setOpenMode(current, openMode));
  }

  return (
    <div className="app-shell">
      <header className="titlebar">
        <span className="document-state">
          {pendingCommand
            ? `${pendingCommand}...`
            : document.dirty
              ? "Unsaved"
              : document.path
                ? "Saved"
                : "Draft"}
        </span>
        <div className="document-meta" aria-label="Document statistics">
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </div>
      </header>

      <nav className="tabstrip" role="tablist" aria-label="Open documents">
        {workspace.tabs.map((tab) => (
          <div
            className={
              tab.id === workspace.activeTabId ? "tab tab-active" : "tab"
            }
            key={tab.id}
          >
            <button
              type="button"
              role="tab"
              aria-label={tab.session.displayName}
              aria-selected={tab.id === workspace.activeTabId}
              onClick={() =>
                setWorkspace((current) => setActiveDocumentTab(current, tab.id))
              }
            >
              <span aria-hidden="true">{tab.session.displayName}</span>
              {tab.session.dirty ? <span aria-hidden="true"> *</span> : null}
            </button>
            {tab.id === workspace.activeTabId ? (
              <button
                type="button"
                className="tab-close"
                aria-label={`Close ${tab.session.displayName}`}
                onClick={() => closeTab(tab.id)}
              >
                x
              </button>
            ) : null}
          </div>
        ))}
      </nav>

      <div className="command-error-slot">
        {commandError ? (
          <div
            className="command-error"
            role="alert"
            aria-label="File command error"
          >
            {commandError}
          </div>
        ) : null}
      </div>

      <DocumentView
        content={document.content}
        toolbarVisible={toolbarVisible}
        onContentChange={(content) =>
          setWorkspace((current) =>
            updateActiveDocumentTab(current, (session) =>
              updateSessionContent(session, content),
            ),
          )
        }
      />

      {settingsOpen ? (
        <div
          className="settings-backdrop"
          role="presentation"
          onMouseDown={() => setSettingsOpen(false)}
        >
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="settings-dialog-header">
              <h2 id="settings-title">Settings</h2>
              <button
                type="button"
                aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}
              >
                x
              </button>
            </header>
            <fieldset>
              <legend>Open files in</legend>
              <label>
                <input
                  type="radio"
                  name="open-mode"
                  checked={workspace.openMode === "tabs"}
                  onChange={() => updateOpenMode("tabs")}
                />
                Tabs
              </label>
              <label>
                <input
                  type="radio"
                  name="open-mode"
                  checked={workspace.openMode === "windows"}
                  onChange={() => updateOpenMode("windows")}
                />
                Separate windows
              </label>
            </fieldset>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function applySaveResult(
  commandSnapshot: DocumentSession,
  next: DocumentSession,
  current: DocumentSession,
): DocumentSession {
  if (current.id !== commandSnapshot.id) {
    return current;
  }

  if (current.content === commandSnapshot.content) {
    return next;
  }

  return {
    ...next,
    content: current.content,
    dirty: current.content !== next.savedContent,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
