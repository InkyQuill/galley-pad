import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentView } from "./components/DocumentView";
import { FontPicker } from "./components/FontPicker";
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
import {
  APPEARANCE_THEMES,
  EDITOR_FONT_SIZES,
  getAppearanceTheme,
  loadAppearanceThemeId,
  loadEditorFontSettings,
  saveAppearanceThemeId,
  saveEditorFontSettings,
  type AppearanceThemeId,
  type EditorFontFamily,
  type EditorFontSettings,
  type EditorFontSize,
} from "./settings/appearance";
import { loadOpenMode, saveOpenMode } from "./settings/openMode";
import {
  clearSwapState,
  readAppSettings,
  readSwapState,
  writeAppSettings,
  writeSwapState,
  type PersistedAppSettings,
  type PersistedSwapState,
} from "./tauri/appPersistence";
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
import { listenForWindowCloseRequest } from "./tauri/windowClose";
import {
  listSystemFonts,
  type SystemFont,
  type SystemFontCatalog,
} from "./tauri/systemFonts";

type CommandName = "Open" | "Save" | "Save As" | "Open File";
type UnsavedChoice = "save" | "save-as" | "discard" | "cancel";
type UnsavedPromptState = {
  session: DocumentSession;
  resolve: (choice: UnsavedChoice) => void;
};

export default function App() {
  const [workspace, setWorkspace] = useState(() =>
    createDocumentWorkspace(loadOpenMode()),
  );
  const [pendingCommand, setPendingCommand] = useState<CommandName | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appearanceThemeId, setAppearanceThemeId] = useState<AppearanceThemeId>(
    () => loadAppearanceThemeId(),
  );
  const [editorFontSettings, setEditorFontSettings] =
    useState<EditorFontSettings>(() => loadEditorFontSettings());
  const [fontCatalog, setFontCatalog] = useState<SystemFontCatalog>({
    fonts: [],
    locale: null,
    previewText: "Aa Bb Cc 0123456789 The quick brown fox",
  });
  const [fontsLoading, setFontsLoading] = useState(false);
  const [swapReady, setSwapReady] = useState(false);
  const [unsavedPrompt, setUnsavedPrompt] = useState<UnsavedPromptState | null>(
    null,
  );
  const latestWorkspace = useRef(workspace);
  const latestAppearanceThemeId = useRef(appearanceThemeId);
  const latestEditorFontSettings = useRef(editorFontSettings);
  const swapWriteTimer = useRef<number | null>(null);
  const settingsDialogRef = useRef<HTMLDialogElement>(null);
  const unsavedDialogRef = useRef<HTMLDialogElement>(null);
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
  latestAppearanceThemeId.current = appearanceThemeId;
  latestEditorFontSettings.current = editorFontSettings;
  const activeTab = getActiveDocumentTab(workspace);
  const document = activeTab.session;

  useEffect(() => {
    globalThis.document.title = `${document.dirty ? "* " : ""}${
      document.displayName
    } - Galley Pad`;
  }, [document.dirty, document.displayName]);

  useEffect(() => {
    let disposed = false;

    void readAppSettings()
      .then((settings) => {
        if (disposed || !settings) {
          return;
        }

        if (isAppearanceThemeId(settings.appearanceTheme)) {
          setAppearanceThemeId(settings.appearanceTheme);
          saveAppearanceThemeId(settings.appearanceTheme);
        }

        const editorFontSize = settings.editorFontSize;
        if (isEditorFontSize(editorFontSize)) {
          setEditorFontSettings((current) => {
            const next = {
              family:
                settings.editorFontFamily && settings.editorFontFamily.trim()
                  ? settings.editorFontFamily
                  : current.family,
              size: editorFontSize,
            };
            saveEditorFontSettings(next);
            return next;
          });
        } else if (settings.editorFontFamily?.trim()) {
          setEditorFontSettings((current) => {
            const next = { ...current, family: settings.editorFontFamily! };
            saveEditorFontSettings(next);
            return next;
          });
        }

        if (isOpenMode(settings.openMode)) {
          saveOpenMode(settings.openMode);
          setWorkspace((current) => setOpenMode(current, settings.openMode!));
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setCommandError(errorMessage(error));
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    void readSwapState()
      .then((swap) => {
        if (disposed) {
          return;
        }

        const restored = restoreWorkspaceFromSwap(swap);
        if (restored) {
          setWorkspace(restored);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setCommandError(errorMessage(error));
        }
      })
      .finally(() => {
        if (!disposed) {
          setSwapReady(true);
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!swapReady) {
      return;
    }

    if (swapWriteTimer.current !== null) {
      window.clearTimeout(swapWriteTimer.current);
    }

    swapWriteTimer.current = window.setTimeout(() => {
      const snapshot = createSwapState(latestWorkspace.current);
      const action = snapshot ? writeSwapState(snapshot) : clearSwapState();
      void action.catch((error: unknown) => {
        setCommandError(errorMessage(error));
      });
    }, 350);

    return () => {
      if (swapWriteTimer.current !== null) {
        window.clearTimeout(swapWriteTimer.current);
        swapWriteTimer.current = null;
      }
    };
  }, [swapReady, workspace]);

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

    void listenForWindowCloseRequest(async () => {
      const canClose = await resolveAllDirtyTabsForClose();
      if (canClose) {
        await clearSwapState();
      }
      return canClose;
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

      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === "t") {
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

  useEffect(() => {
    if (!unsavedPrompt) {
      return;
    }

    const dialog = unsavedDialogRef.current;
    if (!dialog) {
      return;
    }

    if (!dialog.open && typeof dialog.showModal === "function") {
      dialog.showModal();
    } else if (!dialog.open) {
      dialog.setAttribute("open", "");
    }

    window.requestAnimationFrame(() => {
      dialog.querySelector<HTMLButtonElement>("[data-unsaved-default]")?.focus();
    });

    return () => {
      if (dialog.open && typeof dialog.close === "function") {
        dialog.close();
      } else if (dialog.open) {
        dialog.removeAttribute("open");
      }
    };
  }, [unsavedPrompt]);

  useEffect(() => {
    if (!settingsOpen || fontCatalog.fonts.length > 0) {
      return;
    }

    let disposed = false;
    setFontsLoading(true);
    void listSystemFonts()
      .then((catalog) => {
        if (!disposed) {
          setFontCatalog(normalizeFontCatalog(catalog));
        }
      })
      .catch(() => {
        if (!disposed) {
          setFontCatalog((current) => ({
            ...current,
            previewText: localizedFontPreviewText(navigator.language),
          }));
        }
      })
      .finally(() => {
        if (!disposed) {
          setFontsLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [fontCatalog.fonts.length, settingsOpen]);

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

  async function requestCloseTab(tabId: string) {
    const tab = workspace.tabs.find((candidate) => candidate.id === tabId);
    if (!tab) {
      return;
    }

    const confirmed = await resolveDirtyTabForClose(tabId);
    const result = closeDocumentTab(latestWorkspace.current, tabId, confirmed);
    if (result.closed) {
      setWorkspace(result.workspace);
    }
  }

  function updateOpenMode(openMode: OpenMode) {
    saveOpenMode(openMode);
    void persistAppSettings({ openMode });
    setWorkspace((current) => setOpenMode(current, openMode));
  }

  function updateAppearanceTheme(themeId: AppearanceThemeId) {
    saveAppearanceThemeId(themeId);
    void persistAppSettings({ appearanceTheme: themeId });
    setAppearanceThemeId(themeId);
  }

  function updateEditorFontFamily(family: EditorFontFamily) {
    const next = { ...editorFontSettings, family };
    saveEditorFontSettings(next);
    void persistAppSettings({
      editorFontFamily: next.family,
      editorFontSize: next.size,
    });
    setEditorFontSettings(next);
  }

  function updateEditorFontSize(size: EditorFontSize) {
    const next = { ...editorFontSettings, size };
    saveEditorFontSettings(next);
    void persistAppSettings({
      editorFontFamily: next.family,
      editorFontSize: next.size,
    });
    setEditorFontSettings(next);
  }

  function promptUnsavedChanges(session: DocumentSession): Promise<UnsavedChoice> {
    return new Promise((resolve) => {
      setUnsavedPrompt({ session, resolve });
    });
  }

  function answerUnsavedPrompt(choice: UnsavedChoice) {
    unsavedPrompt?.resolve(choice);
    setUnsavedPrompt(null);
  }

  async function resolveDirtyTabForClose(tabId: string): Promise<boolean> {
    const tab = latestWorkspace.current.tabs.find(
      (candidate) => candidate.id === tabId,
    );
    if (!tab || !tab.session.dirty) {
      return true;
    }

    const choice = await promptUnsavedChanges(tab.session);
    switch (choice) {
      case "discard":
        return true;
      case "cancel":
        return false;
      case "save":
        return saveTabBeforeClose(tabId, false);
      case "save-as":
        return saveTabBeforeClose(tabId, true);
    }
  }

  async function resolveAllDirtyTabsForClose(): Promise<boolean> {
    const dirtyTabIds = latestWorkspace.current.tabs
      .filter((tab) => tab.session.dirty)
      .map((tab) => tab.id);

    for (const tabId of dirtyTabIds) {
      const resolved = await resolveDirtyTabForClose(tabId);
      if (!resolved) {
        return false;
      }
    }

    return true;
  }

  async function saveTabBeforeClose(
    tabId: string,
    forceSaveAs: boolean,
  ): Promise<boolean> {
    const commandSnapshot = latestWorkspace.current.tabs.find(
      (tab) => tab.id === tabId,
    )?.session;
    if (!commandSnapshot) {
      return true;
    }

    setCommandError(null);
    setPendingCommand(forceSaveAs ? "Save As" : "Save");

    try {
      const next = forceSaveAs
        ? await saveDocumentAs(commandSnapshot, dependencies)
        : await saveDocument(commandSnapshot, dependencies);

      if (!next) {
        return false;
      }

      setWorkspace((current) =>
        updateDocumentTab(current, tabId, (currentSession) =>
          applySaveResult(commandSnapshot, next, currentSession),
        ),
      );
      latestWorkspace.current = updateDocumentTab(
        latestWorkspace.current,
        tabId,
        (currentSession) => applySaveResult(commandSnapshot, next, currentSession),
      );
      return true;
    } catch (error: unknown) {
      setCommandError(errorMessage(error));
      return false;
    } finally {
      setPendingCommand(null);
    }
  }

  async function persistAppSettings(settings: Partial<PersistedAppSettings>) {
    const next = {
      appearanceTheme: latestAppearanceThemeId.current,
      editorFontFamily: latestEditorFontSettings.current.family,
      editorFontSize: latestEditorFontSettings.current.size,
      openMode: latestWorkspace.current.openMode,
      ...settings,
    };

    try {
      await writeAppSettings(next);
    } catch (error: unknown) {
      setCommandError(errorMessage(error));
    }
  }

  function closeSettings() {
    setSettingsOpen(false);
  }

  const activeTabButtonId = tabButtonId(workspace.activeTabId);
  const activeTabPanelId = tabPanelId(workspace.activeTabId);
  const appearanceTheme = getAppearanceTheme(appearanceThemeId);

  return (
    <div className={`app-shell ${appearanceTheme.appClassName}`}>
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
                onClick={() => void requestCloseTab(tab.id)}
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
            <span>{commandError}</span>
            <button
              type="button"
              aria-label="Dismiss file command error"
              onClick={() => setCommandError(null)}
            >
              x
            </button>
          </div>
        ) : null}
      </div>

      <DocumentView
        content={document.content}
        panelId={activeTabPanelId}
        labelledBy={activeTabButtonId}
        toolbarVisible={toolbarVisible}
        theme={appearanceTheme}
        fontSettings={editorFontSettings}
        status={
          pendingCommand
            ? `${pendingCommand}...`
            : document.dirty
              ? "Unsaved"
              : document.path
                ? "Saved"
                : "Draft"
        }
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
          <fieldset>
            <legend>Theme</legend>
            {APPEARANCE_THEMES.map((theme) => (
              <label key={theme.id}>
                <input
                  type="radio"
                  name="appearance-theme"
                  checked={appearanceThemeId === theme.id}
                  onChange={() => updateAppearanceTheme(theme.id)}
                />
                {theme.label}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Editor font</legend>
            <div className="settings-field settings-field-stacked">
              <span className="settings-field-label">Family</span>
              <FontPicker
                value={editorFontSettings.family}
                fonts={fontCatalog.fonts}
                previewText={fontCatalog.previewText}
                loading={fontsLoading}
                onChange={updateEditorFontFamily}
              />
            </div>
            <label className="settings-field">
              Size
              <select
                aria-label="Editor font size"
                value={editorFontSettings.size}
                onChange={(event) =>
                  updateEditorFontSize(event.currentTarget.value as EditorFontSize)
                }
              >
                {EDITOR_FONT_SIZES.map((fontSize) => (
                  <option key={fontSize.id} value={fontSize.id}>
                    {fontSize.label}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        </dialog>
      ) : null}

      {unsavedPrompt ? (
        <dialog
          ref={unsavedDialogRef}
          className="unsaved-dialog"
          aria-labelledby="unsaved-title"
          aria-describedby="unsaved-description"
          onCancel={(event) => {
            event.preventDefault();
            answerUnsavedPrompt("cancel");
          }}
        >
          <header className="unsaved-dialog-header">
            <h2 id="unsaved-title">Save changes?</h2>
          </header>
          <div className="unsaved-dialog-body">
            <p id="unsaved-description">
              {unsavedPrompt.session.displayName} has unsaved changes.
            </p>
          </div>
          <footer className="unsaved-dialog-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => answerUnsavedPrompt("cancel")}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={() => answerUnsavedPrompt("discard")}
            >
              Discard
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => answerUnsavedPrompt("save-as")}
            >
              Save As
            </button>
            <button
              type="button"
              className="button-primary"
              data-unsaved-default
              onClick={() => answerUnsavedPrompt("save")}
            >
              Save
            </button>
          </footer>
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

function normalizeFontCatalog(catalog: SystemFontCatalog): SystemFontCatalog {
  return {
    locale: catalog.locale,
    previewText:
      catalog.previewText || localizedFontPreviewText(catalog.locale ?? undefined),
    fonts: catalog.fonts.slice().sort(compareSystemFonts),
  };
}

function compareSystemFonts(left: SystemFont, right: SystemFont): number {
  return left.family.localeCompare(right.family, undefined, {
    sensitivity: "base",
  });
}

function localizedFontPreviewText(locale: string | undefined): string {
  const language = locale?.split(/[-_]/)[0]?.toLowerCase();
  if (
    language &&
    ["ru", "be", "bg", "kk", "ky", "mk", "mn", "sr", "tg", "uk"].includes(
      language,
    )
  ) {
    return "Aa Bb Cc Аа Бб Вв 0123456789 Съешь ещё этих мягких булок";
  }

  return "Aa Bb Cc 0123456789 The quick brown fox";
}

function createSwapState(workspace: DocumentWorkspace): PersistedSwapState | null {
  if (!workspace.tabs.some((tab) => tab.session.dirty)) {
    return null;
  }

  return {
    version: 1,
    savedAt: Date.now(),
    activeTabId: workspace.activeTabId,
    openMode: workspace.openMode,
    tabs: workspace.tabs.map((tab) => ({
      id: tab.id,
      session: tab.session,
    })),
  };
}

function restoreWorkspaceFromSwap(
  swap: PersistedSwapState | null,
): DocumentWorkspace | null {
  if (!swap || swap.version !== 1 || !isOpenMode(swap.openMode)) {
    return null;
  }

  const tabs = Array.isArray(swap.tabs)
    ? swap.tabs.filter((tab) => isPersistedTab(tab))
    : [];
  if (tabs.length === 0 || !tabs.some((tab) => tab.session.dirty)) {
    return null;
  }

  const activeTabId = tabs.some((tab) => tab.id === swap.activeTabId)
    ? swap.activeTabId
    : tabs[0].id;

  return {
    tabs,
    activeTabId,
    openMode: swap.openMode,
  };
}

function isPersistedTab(value: unknown): value is DocumentWorkspace["tabs"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const tab = value as DocumentWorkspace["tabs"][number];
  return typeof tab.id === "string" && isDocumentSession(tab.session);
}

function isDocumentSession(value: unknown): value is DocumentSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as DocumentSession;
  return (
    typeof session.id === "string" &&
    (typeof session.path === "string" || session.path === null) &&
    typeof session.displayName === "string" &&
    typeof session.content === "string" &&
    typeof session.savedContent === "string" &&
    typeof session.dirty === "boolean" &&
    (session.lineEnding === "lf" || session.lineEnding === "crlf") &&
    (typeof session.lastKnownModifiedAt === "number" ||
      session.lastKnownModifiedAt === null)
  );
}

function isAppearanceThemeId(value: unknown): value is AppearanceThemeId {
  return (
    value === "system" ||
    value === "galley-light" ||
    value === "galley-dark"
  );
}

function isEditorFontSize(value: unknown): value is EditorFontSize {
  return value === "small" || value === "medium" || value === "large";
}

function isOpenMode(value: unknown): value is OpenMode {
  return value === "tabs" || value === "windows";
}
