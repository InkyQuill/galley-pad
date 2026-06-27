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
  getPendingMarkdownFileOpens,
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
  const settingsDialogRef = useRef<HTMLDialogElement>(null);
  const settingsReturnFocusRef = useRef<HTMLElement | null>(null);
  const externalOpenQueue = useRef(Promise.resolve());
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

    function enqueueExternalOpen(path: string) {
      externalOpenQueue.current = externalOpenQueue.current.then(async () => {
        if (!disposed) {
          await openExternalFile(path);
        }
      });
    }

    void listenForMarkdownFileOpen((path) => {
      enqueueExternalOpen(path);
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
      } else {
        unlisten = nextUnlisten;
      }
    });

    const windowLaunchPath = getWindowMarkdownFileOpen();
    if (windowLaunchPath) {
      void openFileInCurrentWindow(windowLaunchPath);
      return () => {
        disposed = true;
        unlisten?.();
      };
    }

    void getPendingMarkdownFileOpens()
      .then((paths) => {
        paths.forEach(enqueueExternalOpen);
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

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    const dialog = settingsDialogRef.current;
    if (!dialog) {
      return;
    }

    settingsReturnFocusRef.current =
      globalThis.document.activeElement instanceof HTMLElement
        ? globalThis.document.activeElement
        : null;

    function handleClose() {
      setSettingsOpen(false);
    }

    dialog.addEventListener("close", handleClose);
    if (!dialog.open && typeof dialog.showModal === "function") {
      dialog.showModal();
    } else if (!dialog.open) {
      dialog.setAttribute("open", "");
    }

    window.requestAnimationFrame(() => {
      const selectedOpenMode = dialog.querySelector<HTMLInputElement>(
        'input[name="open-mode"]:checked',
      );
      (selectedOpenMode ?? dialog).focus();
    });

    return () => {
      dialog.removeEventListener("close", handleClose);
      if (dialog.open && typeof dialog.close === "function") {
        dialog.close();
      } else if (dialog.open) {
        dialog.removeAttribute("open");
      }
      settingsReturnFocusRef.current?.focus();
      settingsReturnFocusRef.current = null;
    };
  }, [settingsOpen]);

  function addNewTab() {
    setCommandError(null);
    setWorkspace((current) => addDocumentTab(current));
  }

  function runOpenCommand(
    name: CommandName,
    command: () => Promise<DocumentSession | null>,
  ): Promise<void> {
    setCommandError(null);
    setPendingCommand(name);

    return command()
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

  function runOpenWindowCommand(
    name: CommandName,
    command: () => Promise<string | null>,
  ): Promise<void> {
    setCommandError(null);
    setPendingCommand(name);

    return command()
      .then(() => undefined)
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

  function openExternalFile(path: string): Promise<void> {
    if (latestWorkspace.current.openMode === "windows") {
      return runOpenWindowCommand("Open File", () => openMarkdownFileWindow(path));
    }

    return runOpenCommand("Open File", () => openDocumentPath(path, dependencies));
  }

  function openFileInCurrentWindow(path: string) {
    return runOpenCommand("Open File", () => openDocumentPath(path, dependencies));
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

  function closeSettings() {
    setSettingsOpen(false);
  }

  const activeTabButtonId = tabButtonId(workspace.activeTabId);
  const activeTabPanelId = tabPanelId(workspace.activeTabId);

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
              id={tabButtonId(tab.id)}
              aria-controls={tabPanelId(tab.id)}
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
        panelId={activeTabPanelId}
        labelledBy={activeTabButtonId}
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
        <dialog
          ref={settingsDialogRef}
          className="settings-dialog"
          aria-labelledby="settings-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeSettings();
            }
          }}
          onCancel={closeSettings}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              closeSettings();
            }
          }}
        >
          <header className="settings-dialog-header">
            <h2 id="settings-title">Settings</h2>
            <button
              type="button"
              aria-label="Close settings"
              onClick={closeSettings}
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
        </dialog>
      ) : null}
    </div>
  );
}

function tabButtonId(tabId: string): string {
  return `document-tab-${tabId}`;
}

function tabPanelId(tabId: string): string {
  return `document-panel-${tabId}`;
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
