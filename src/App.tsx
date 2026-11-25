import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  TbX,
} from "react-icons/tb";
import type { DocumentViewHandle } from "./components/DocumentView";
import { RetainedDocumentPane } from "./components/RetainedDocumentPane";
import { APP_VERSION } from "./appInfo";
import { ExternalFileBanner } from "./components/ExternalFileBanner";
import { ExternalReconcileView } from "./components/ExternalReconcileView";
import { RecentFilesDialog } from "./components/RecentFilesDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { TabStrip, tabButtonId, tabPanelId } from "./components/TabStrip";
import {
  checkExternalFileChange,
  createLifecycleDependencies,
  openDocumentPath,
  saveDocument,
  saveDocumentAs,
  UnsupportedFileEncodingError,
  type ExternalFileChangeResult,
  type LifecycleDependencies,
} from "./document/lifecycle";
import {
  applyExternalFileReload,
  createUntitledSession,
  markExternalDeletionAcknowledged,
  markExternalUpdateNoticed,
  setExternalUpdatePolicy,
  updateSessionContent,
  type DocumentSession,
} from "./document/session";
import { createSwapState, restoreWorkspaceFromSwap } from "./document/recovery";
import {
  addDocumentTab,
  closeDocumentTab,
  createDocumentWorkspace,
  getActiveDocumentTab,
  moveDocumentTab,
  openDocumentTab,
  setActiveDocumentTab,
  setOpenMode,
  updateDocumentTab,
  type DocumentWorkspace,
  type OpenMode,
} from "./document/workspace";
import {
  getAppearanceTheme,
  loadEditorFontSettings,
  saveAppearanceThemeId,
  saveEditorFontSettings,
  type AppearanceThemeId,
  type EditorFontFamily,
  type EditorFontSettings,
  type EditorFontSize,
} from "./settings/appearance";
import { loadOpenMode, saveOpenMode } from "./settings/openMode";
import { normalizeWordWrap } from "./settings/wordWrap";
import { normalizeEditorLineWidth } from "./settings/reading";
import {
  clearSwapState,
  readAppSettings,
  readSwapState,
  writeAppSettings,
  writeSwapState,
  type PersistedAppSettings,
  type RawPersistedAppSettings,
} from "./tauri/appPersistence";
import {
  claimDocumentPath,
  listenForDocumentActivation,
  releaseDocumentTab,
} from "./tauri/documentOwnership";
import { useWindowCloseLifecycle } from "./components/useWindowCloseLifecycle";
import { pickOpenFile, pickSaveFile } from "./tauri/dialogs";
import {
  getPendingMarkdownFileOpens,
  getWindowMarkdownFileOpen,
  listenForMarkdownFileOpen,
  type MarkdownFileOpen,
} from "./tauri/externalFiles";
import { readTextFile, writeTextFile } from "./tauri/files";
import {
  listenForAppMenuCommand,
  type AppMenuCommand,
} from "./tauri/menuEvents";
import {
  listenForActiveDocumentChanges,
  listenForMarkdownDrop,
  readRecentFiles,
  setActiveDocumentWatch,
  updateRecentFile,
} from "./tauri/nativeFiles";
import { setFileMenuBusy, syncWordWrapMenuChecked } from "./tauri/nativeMenu";
import { openReleasePage } from "./tauri/opener";
import { listenForAppSettingsUpdates } from "./tauri/settingsEvents";
import { openDraftWindow, openMarkdownFileWindow, setCurrentWindowTitle } from "./tauri/windows";
import {
  closeCurrentWindow,
} from "./tauri/windowClose";
import {
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  isThemeId,
  listThemesByScheme,
} from "./themes/catalog";
import { resolveTheme } from "./themes/resolve";
import {
  loadThemeSettings,
  parseThemeSettings,
  saveThemeSettings,
  type ThemeMode,
  type ThemeSettings,
} from "./themes/settings";
import { themeToCssVariables } from "./themes/style";
import { focusForeground } from "./themes/focusForeground";
import type { ThemeId, ThemeScheme } from "./themes/tokens";
import {
  checkForGitHubUpdate,
  type AvailableUpdate,
} from "./updates/githubRelease";

type CommandName = "New" | "Open" | "Save" | "Save As" | "Open File";
type UnsavedChoice = "save" | "save-as" | "discard" | "cancel";
type UnsavedPromptState = {
  session: DocumentSession;
  resolve: (choice: UnsavedChoice) => void;
};
type AppProps = {
  onUnsavedPrompt?: () => void;
};
type ExternalFileWarning =
  | { kind: "encoding"; tabId: string }
  | {
      kind: "clean-update";
      tabId: string;
      result: Extract<ExternalFileChangeResult, { kind: "clean-update" }>;
    }
  | {
      kind: "conflict";
      tabId: string;
      result: Extract<ExternalFileChangeResult, { kind: "conflict" }>;
    }
  | {
      kind: "deleted";
      tabId: string;
      result: Extract<ExternalFileChangeResult, { kind: "deleted" }>;
    };

export default function App({ onUnsavedPrompt }: AppProps = {}) {
  const [workspace, setWorkspace] = useState(() =>
    createDocumentWorkspace(loadOpenMode()),
  );
  const closeConfirmation = useRef<Promise<boolean> | null>(null);
  const [pendingCommand, setPendingCommand] = useState<CommandName | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [encodingRetry, setEncodingRetry] = useState<UnsupportedFileEncodingError | null>(null);
  const [availableUpdate, setAvailableUpdate] =
    useState<AvailableUpdate | null>(null);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [outlineTabId, setOutlineTabId] = useState<string | null>(null);
  const outlineOpen = outlineTabId === workspace.activeTabId;
  const [editorLineWidth, setEditorLineWidth] = useState(() => normalizeEditorLineWidth(null));
  const [spellcheck, setSpellcheck] = useState(false);
  const [allowRemoteImages, setAllowRemoteImages] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<string[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSettingsReady, setAppSettingsReady] = useState(false);
  const [checkForUpdates, setCheckForUpdates] = useState(true);
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(() =>
    loadNormalizedThemeSettings(),
  );
  const [systemScheme, setSystemScheme] = useState<ThemeScheme>(() =>
    getSystemScheme(),
  );
  const [editorFontSettings, setEditorFontSettings] =
    useState<EditorFontSettings>(() => loadEditorFontSettings());
  const [swapReady, setSwapReady] = useState(false);
  const swapRecovery = useRef<Promise<void> | null>(null);
  const { quitApproved, quitApprovedRef } = useWindowCloseLifecycle({
    recoveryReady: swapReady,
    waitForRecovery: () => swapRecovery.current,
    confirm: confirmClosingAllTabs,
    prepare: prepareApprovedClose,
    onError: (error) => setCommandError(errorMessage(error)),
  });
  const recentlyClosedPaths = useRef<string[]>([]);
  const closeTabInFlight = useRef(false);
  const [unsavedPrompt, setUnsavedPrompt] = useState<UnsavedPromptState | null>(
    null,
  );
  const [externalFileWarning, setExternalFileWarning] =
    useState<ExternalFileWarning | null>(null);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const latestWorkspace = useRef(workspace);
  const saveInFlight = useRef<Promise<boolean> | null>(null);
  const latestExternalFileWarning = useRef(externalFileWarning);
  const latestThemeSettings = useRef(themeSettings);
  const latestEditorFontSettings = useRef(editorFontSettings);
  const latestWordWrap = useRef(wordWrap);
  const [fragmentRequest, setFragmentRequest] = useState<{ tabId: string; fragment: string } | null>(null);
  const documentViewRef = useRef<DocumentViewHandle>(null);
  const updateCheckPromiseRef =
    useRef<Promise<AvailableUpdate | null> | null>(null);
  const swapWriteTimer = useRef<number | null>(null);
  const swapWriteChain = useRef<Promise<void>>(Promise.resolve());
  const closingRef = useRef(false);
  const appSettingsReadComplete = useRef(false);
  const pendingAppSettingsWrite = useRef<Partial<PersistedAppSettings> | null>(
    null,
  );
  const appSettingsWriteInFlight = useRef<Promise<void> | null>(null);
  const touchedPreferences = useRef({
    checkForUpdates: false,
    editorLineWidth: false,
    spellcheck: false,
    allowRemoteImages: false,
    appearanceTheme: false,
    editorFont: false,
    openMode: false,
    wordWrap: false,
  });
  const unsavedDialogRef = useRef<HTMLDialogElement>(null);
  const externalOpenQueue = useRef(Promise.resolve());
  const externalCheckChain = useRef<Promise<void>>(Promise.resolve());
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

  latestThemeSettings.current = themeSettings;
  latestEditorFontSettings.current = editorFontSettings;
  const activeTab = getActiveDocumentTab(workspace);
  const document = activeTab.session;

  useEffect(() => {
    const title = `${document.dirty ? "* " : ""}${document.displayName} - Galley Pad`;
    globalThis.document.title = title;
    if ("__TAURI_INTERNALS__" in globalThis) {
      void setCurrentWindowTitle(title).catch((error: unknown) => setCommandError(errorMessage(error)));
    }
  }, [document.dirty, document.displayName]);

  useEffect(() => {
    if (!appSettingsReady) return;
    if (!checkForUpdates) {
      updateCheckPromiseRef.current = null;
      return;
    }
    let disposed = false;

    updateCheckPromiseRef.current ??= checkForGitHubUpdate(APP_VERSION);
    void updateCheckPromiseRef.current.then((update) => {
      if (!disposed) {
        setAvailableUpdate(update);
      }
    });

    return () => {
      disposed = true;
    };
  }, [appSettingsReady, checkForUpdates]);

  useEffect(() => {
    function checkActiveExternalFile() {
      enqueueExternalFileChecks([latestWorkspace.current.activeTabId]);
    }

    function handleVisibilityChange() {
      if (globalThis.document.visibilityState === "visible") {
        checkActiveExternalFile();
      }
    }

    globalThis.addEventListener("focus", checkActiveExternalFile);
    globalThis.document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    return () => {
      globalThis.removeEventListener("focus", checkActiveExternalFile);
      globalThis.document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.PROD) {
      return;
    }

    function handleTestExternalUpdate(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (!detail || typeof detail !== "object") {
        return;
      }

      const current =
        typeof detail.current === "string" ? detail.current : "Current\n";
      const incoming =
        typeof detail.incoming === "string" ? detail.incoming : "Incoming\n";
      const displayName =
        typeof detail.displayName === "string" ? detail.displayName : "notes.md";
      const tabId = latestWorkspace.current.activeTabId;
      const session: DocumentSession = {
        ...createUntitledSession(),
        id: "file:/tmp/test-external-update.md",
        path: "/tmp/test-external-update.md",
        displayName,
        content: current,
        savedContent: current,
        dirty: false,
        lastKnownModifiedAt: 1,
      };
      const warning: ExternalFileWarning = {
        kind: "clean-update",
        tabId,
        result: {
          kind: "clean-update",
          session,
          external: {
            path: "/tmp/test-external-update.md",
            content: incoming,
            lineEnding: "lf",
            lastModifiedAt: 2,
          },
        },
      };

      updateWorkspaceNow((workspace) =>
        updateDocumentTab(workspace, tabId, () => session),
      );
      showExternalWarning(warning);
    }

    window.addEventListener(
      "galley-pad-test-external-update",
      handleTestExternalUpdate,
    );
    return () => {
      window.removeEventListener(
        "galley-pad-test-external-update",
        handleTestExternalUpdate,
      );
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.PROD) {
      return;
    }

    const handleTestMenuCommand = (event: Event) => {
      const command = (event as CustomEvent<AppMenuCommand>).detail;
      if (command === "find" || command === "toggle-word-wrap") {
        runMenuCommand(command);
      }
    };

    window.addEventListener("galley-pad-test-menu-command", handleTestMenuCommand);
    return () => {
      window.removeEventListener(
        "galley-pad-test-menu-command",
        handleTestMenuCommand,
      );
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const earlyPatches: RawPersistedAppSettings[] = [];
    let readComplete = false;

    void listenForAppSettingsUpdates((patch) => {
      if (disposed) return;
      if (readComplete) applyAppSettings(patch, false);
      else earlyPatches.push(patch);
    }).then((remove) => {
      if (disposed) remove();
      else unlisten = remove;
    }).catch((error: unknown) => {
      if (!disposed) setCommandError(errorMessage(error));
    }).then(readAppSettings).then((settings) => {
      if (!disposed) applyAppSettings(settings ?? {}, true);
    }).catch((error: unknown) => {
      if (!disposed) setCommandError(errorMessage(error));
    }).finally(() => {
      if (disposed) return;
      readComplete = true;
      for (const patch of earlyPatches) applyAppSettings(patch, false);
      releaseAppSettingsReadBarrier();
      setAppSettingsReady(true);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    swapRecovery.current = readSwapState()
      .then(async (swap) => {
        if (disposed || !swap || getWindowMarkdownFileOpen()) return;
        const restored = await restoreWorkspaceFromSwap(swap, {
          claim: claimDocumentPath,
          release: releaseDocumentTab,
          read: readTextFile,
        });
        if (!disposed && restored) {
          updateWorkspaceNow(() => restored.workspace);
          const unavailable = restored.unavailableCount;
          setRecoveryNotice(unavailable > 0
            ? `Recovered unsaved changes. Could not reopen ${unavailable} saved ${unavailable === 1 ? "tab" : "tabs"}.`
            : "Recovered unsaved changes.");
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setCommandError(errorMessage(error));
        }
      })
      .finally(() => {
        if (!disposed) {
          swapRecovery.current = null;
          setSwapReady(true);
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mediaQuery) {
      return;
    }

    const updateSystemScheme = (event: MediaQueryListEvent) => {
      setSystemScheme(event.matches ? "dark" : "light");
    };

    setSystemScheme(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener?.("change", updateSystemScheme);
    mediaQuery.addListener?.(updateSystemScheme);

    return () => {
      mediaQuery.removeEventListener?.("change", updateSystemScheme);
      mediaQuery.removeListener?.(updateSystemScheme);
    };
  }, []);

  useEffect(() => {
    if (!swapReady || closingRef.current) {
      return;
    }

    if (swapWriteTimer.current !== null) {
      window.clearTimeout(swapWriteTimer.current);
    }

    swapWriteTimer.current = window.setTimeout(() => {
      swapWriteTimer.current = null;
      if (closingRef.current) {
        return;
      }

      const snapshot = createSwapState(latestWorkspace.current);
      const action = () => (snapshot ? writeSwapState(snapshot) : clearSwapState());
      swapWriteChain.current = swapWriteChain.current
        .then(action, action)
        .catch((error: unknown) => {
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
    if (!swapReady) {
      return;
    }

    let disposed = false;

    function enqueueExternalOpen(request: MarkdownFileOpen, startup = false) {
      externalOpenQueue.current = externalOpenQueue.current.then(async () => {
        if (!disposed) {
          const file = typeof request === "string"
            ? { path: request, allowMissing: startup }
            : request;
          await openExternalFile(file.path, file.allowMissing);
        }
      });
    }

    let drains = Promise.resolve();
    const stopListeners: Array<() => void> = [];

    function takePendingOpens() {
      const read = async () => {
        if (disposed) return;
        const pending = await getPendingMarkdownFileOpens();
        pending.forEach((request) => enqueueExternalOpen(request, true));
      };
      drains = drains.then(read, read);
      return drains;
    }

    function reportOpenError(error: unknown) {
      if (!disposed) setCommandError(errorMessage(error));
    }

    function rememberListener(remove: () => void) {
      if (disposed) remove();
      else stopListeners.push(remove);
    }

    void listenForMarkdownFileOpen((request) => {
      if (request === null) void takePendingOpens().catch(reportOpenError);
      else enqueueExternalOpen(request);
    }).then(async (remove) => {
      rememberListener(remove);
      if (disposed) return;
      const windowLaunchPath = getWindowMarkdownFileOpen();
      if (windowLaunchPath) {
        const allowMissing = new URLSearchParams(globalThis.location.search).get("allowMissing") === "1";
        await openFileInCurrentWindow(windowLaunchPath, allowMissing, new URLSearchParams(globalThis.location.search).get("fragment") || undefined);
      }
      await takePendingOpens();
    }).catch(reportOpenError);

    void listenForMarkdownDrop((paths) => {
      paths.forEach((path) => enqueueExternalOpen({ path, allowMissing: false }));
    }).then(rememberListener).catch(reportOpenError);

    return () => {
      disposed = true;
      stopListeners.forEach((remove) => remove());
    };
  }, [swapReady]);

  useEffect(() => {
    let disposed = false;
    let timeout: number | undefined;
    let unlisten: (() => void) | undefined;
    const path = document.path;
    const tabId = workspace.activeTabId;
    void listenForActiveDocumentChanges((changedPath) => {
      if (disposed || changedPath !== path) return;
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => enqueueExternalFileChecks([tabId]), 120);
    }).then(async (remove) => {
      if (disposed) { remove(); return; }
      unlisten = remove;
      await setActiveDocumentWatch(path);
    }).catch((error: unknown) => {
      if (!disposed) console.warn("Could not watch the active file", error);
    });
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      unlisten?.();
    };
  }, [document.path, workspace.activeTabId]);

  useEffect(() => {
    const sync = () => {
      void setFileMenuBusy(pendingCommand !== null || quitApproved).catch((error: unknown) => {
        console.warn("Could not update native file menu", error);
      });
    };
    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [pendingCommand, quitApproved]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listenForDocumentActivation((tabId, fragment) => {
      if (fragment) setFragmentRequest({ tabId, fragment });
      updateWorkspaceNow((current) => setActiveDocumentTab(current, tabId));
    }).then((remove) => {
      if (disposed) remove();
      else unlisten = remove;
    });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    if (!swapReady) return;
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
    }).catch((error: unknown) => {
      if (!disposed) setCommandError(errorMessage(error));
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [swapReady]);

  // Middle-button defaults are never wanted anywhere in the app: on Linux the
  // release after a middle-click (for example closing a tab that shifts layout
  // mid-click) otherwise triggers a primary-selection paste into the focused
  // editor.
  useEffect(() => {
    function suppressMiddleButtonDefault(event: MouseEvent) {
      if (event.button === 1) {
        event.preventDefault();
      }
    }

    window.addEventListener("mousedown", suppressMiddleButtonDefault, true);
    window.addEventListener("auxclick", suppressMiddleButtonDefault, true);

    return () => {
      window.removeEventListener("mousedown", suppressMiddleButtonDefault, true);
      window.removeEventListener("auxclick", suppressMiddleButtonDefault, true);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey) return;
      const key = event.key.toLowerCase();
      const primary = event.metaKey || event.ctrlKey;
      const current = latestWorkspace.current;
      const inDialog = event.target instanceof Element && event.target.closest("dialog");

      if (primary && !inDialog && !event.shiftKey && key === "w") {
        if ("__TAURI_INTERNALS__" in globalThis && event.metaKey) return;
        event.preventDefault();
        void requestCloseTab(current.activeTabId);
        return;
      }
      if (primary && !inDialog && !event.repeat && event.shiftKey && key === "t") {
        event.preventDefault();
        reopenClosedTab();
        return;
      }
      if (event.ctrlKey && !event.metaKey && !inDialog && key === "tab") {
        event.preventDefault();
        const index = current.tabs.findIndex((tab) => tab.id === current.activeTabId);
        const delta = event.shiftKey ? -1 : 1;
        const target = current.tabs[(index + delta + current.tabs.length) % current.tabs.length];
        selectDocumentTab(target.id);
        return;
      }
      if (primary && !inDialog && !event.shiftKey && /^[1-9]$/.test(key)) {
        const target = key === "9" ? current.tabs[current.tabs.length - 1] : current.tabs[Number(key) - 1];
        if (target) {
          event.preventDefault();
          selectDocumentTab(target.id);
        }
        return;
      }
      if (primary && !inDialog && !event.shiftKey && key === "n") {
        event.preventDefault();
        addNewTab();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }

      if (primary && !inDialog && !event.repeat && event.shiftKey && key === "o") {
        event.preventDefault();
        toggleEditorOutline();
        return;
      }

      if (primary && event.shiftKey && key === "l") {
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


  function addNewTab() {
    setCommandError(null);
    if (latestWorkspace.current.openMode === "windows" && "__TAURI_INTERNALS__" in globalThis) {
      void runOpenWindowCommand("New", openDraftWindow);
      return;
    }
    updateWorkspaceNow((current) => addDocumentTab(current));
  }

  async function runOpenCommand(
    name: CommandName,
    pickPath: () => Promise<string | null>,
    allowMissing = false,
    encoding?: "windows1251",
    fragment?: string,
  ): Promise<void> {
    setCommandError(null);
    setEncodingRetry(null);
    setPendingCommand(name);
    const tabId = crypto.randomUUID();
    let claimed = false;
    try {
      const requestedPath = await pickPath();
      if (!requestedPath || quitApprovedRef.current) return;
      const alreadyOpen = latestWorkspace.current.tabs.find((tab) => tab.session.path === requestedPath);
      if (alreadyOpen) {
        updateWorkspaceNow((current) => setActiveDocumentTab(current, alreadyOpen.id));
        if (fragment) setFragmentRequest({ tabId: alreadyOpen.id, fragment });
        if (alreadyOpen.session.fileExists !== false) rememberRecentDocument(requestedPath);
        return;
      }
      const path = fragment ? await claimDocumentPath(requestedPath, tabId, fragment) : await claimDocumentPath(requestedPath, tabId);
      if (!path) return;
      claimed = true;
      const next = await openDocumentPath(path, dependencies, { allowMissing, encoding });
      updateWorkspaceNow((current) => openDocumentTab(current, next, tabId));
      if (fragment) setFragmentRequest({ tabId, fragment });
      if (next.path && next.fileExists !== false) rememberRecentDocument(next.path);
    } catch (error: unknown) {
      if (claimed) await releaseDocumentTab(tabId).catch(() => undefined);
      if (!encoding && error instanceof UnsupportedFileEncodingError) {
        setEncodingRetry(error);
      }
      setCommandError(errorMessage(error));
    } finally {
      setPendingCommand(null);
    }
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
    command: (session: DocumentSession, tabId: string) => Promise<DocumentSession | null>,
  ) {
    const tabId = latestWorkspace.current.activeTabId;
    const commandSnapshot = getActiveDocumentTab(latestWorkspace.current).session;
    const warningSnapshot = latestExternalFileWarning.current;
    const activeWarning =
      warningSnapshot?.tabId === tabId ? warningSnapshot : null;

    if (
      name === "Save" &&
      activeWarning &&
      activeWarning.kind !== "clean-update"
    ) {
      setReconcileOpen(false);
      setCommandError(
        activeWarning.kind === "deleted"
          ? "The file was deleted on disk. Use Save As to preserve your changes."
          : activeWarning.kind === "encoding"
            ? "The file encoding changed on disk. Review the disk version or use Save As."
            : "The file changed on disk. Reconcile, reload, or use Save As before saving.",
      );
      return;
    }

    if (closeTabInFlight.current || closeConfirmation.current) return;
    void saveTab(tabId, name, commandSnapshot, command);
  }

  function saveTab(
    tabId: string,
    name: "Save" | "Save As",
    snapshot: DocumentSession,
    command: (session: DocumentSession, tabId: string) => Promise<DocumentSession | null>,
  ): Promise<boolean> {
    if (saveInFlight.current) return Promise.resolve(false);
    setCommandError(null);
    setPendingCommand(name);

    const saving = Promise.resolve()
      .then(() => command(snapshot, tabId))
      .then(async (next) => {
        if (!next) return false;
        if (!latestWorkspace.current.tabs.some((tab) => tab.id === tabId)) {
          await releaseDocumentTab(tabId);
          return false;
        }
        updateWorkspaceNow((current) =>
          updateDocumentTab(current, tabId, (session) => applySaveResult(snapshot, next, session)),
        );
        clearExternalWarningForTab(tabId);
        if (next.path) rememberRecentDocument(next.path);
        return true;
      })
      .catch((error: unknown) => {
        setCommandError(errorMessage(error));
        return false;
      })
      .finally(() => {
        saveInFlight.current = null;
        setPendingCommand(null);
      });
    saveInFlight.current = saving;
    return saving;
  }

  function rememberRecentDocument(path: string) {
    void updateRecentFile(path, true).catch((error: unknown) => {
      console.warn("Could not update recent files", error);
    });
  }

  useEffect(() => {
    if (!fragmentRequest || workspace.activeTabId !== fragmentRequest.tabId) return;
    // Apply navigation after the newly active CodeMirror view has laid out.
    const frame = requestAnimationFrame(() => {
      if (!documentViewRef.current?.revealFragment(fragmentRequest.fragment)) {
        setCommandError(`Heading “${fragmentRequest.fragment}” was not found in this document.`);
      }
      setFragmentRequest(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [fragmentRequest, workspace.activeTabId]);

  function openLinkedDocument(path: string, fragment?: string) {
    return openExternalFile(path, false, fragment);
  }

  function openExternalFile(path: string, allowMissing = false, fragment?: string): Promise<void> {
    if (quitApprovedRef.current) return Promise.resolve();
    if (latestWorkspace.current.openMode === "windows") {
      return runOpenWindowCommand("Open File", () =>
        fragment ? openMarkdownFileWindow(path, allowMissing, fragment) : allowMissing ? openMarkdownFileWindow(path, true) : openMarkdownFileWindow(path)
      );
    }
    return openFileInCurrentWindow(path, allowMissing, fragment);
  }

  function openFileInCurrentWindow(path: string, allowMissing = false, fragment?: string) {
    return runOpenCommand("Open File", async () => path, allowMissing, undefined, fragment);
  }

  function runMenuCommand(command: AppMenuCommand) {
    if (quitApprovedRef.current) return;
    switch (command) {
      case "new":
        addNewTab();
        break;
      case "open-recent":
        void readRecentFiles().then(setRecentFiles).catch((error: unknown) => setCommandError(errorMessage(error)));
        break;
      case "mode-live":
      case "mode-markdown":
      case "mode-preview":
        documentViewRef.current?.setMode(command === "mode-live" ? "live" : command === "mode-markdown" ? "markdown" : "preview");
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
          runOpenCommand("Open", dependencies.pickOpenFile);
        }
        break;
      case "close":
        void requestCloseTab(latestWorkspace.current.activeTabId);
        break;
      case "save":
        runSaveCommand("Save", (session, tabId) => saveDocument(session, dependencies, tabId));
        break;
      case "save-as":
        runSaveCommand("Save As", (session, tabId) =>
          saveDocumentAs(session, dependencies, tabId),
        );
        break;
      case "find":
        documentViewRef.current?.openSearch();
        break;
      case "settings":
        setSettingsOpen(true);
        break;
      case "toggle-toolbar":
        setToolbarVisible((visible) => !visible);
        break;
      case "toggle-outline":
        toggleEditorOutline();
        break;
      case "toggle-word-wrap":
        toggleWordWrap();
        break;
    }
  }

  function reopenClosedTab() {
    const path = recentlyClosedPaths.current.pop();
    if (path) void openExternalFile(path);
  }

  async function requestCloseTab(tabId: string): Promise<boolean> {
    if (
      closeTabInFlight.current || closingRef.current || closeConfirmation.current ||
      !latestWorkspace.current.tabs.some((tab) => tab.id === tabId)
    ) {
      return false;
    }

    closeTabInFlight.current = true;
    try {
      if (swapRecovery.current) await swapRecovery.current;
      if (saveInFlight.current) await saveInFlight.current;
      if (!(await resolveDirtyTabForClose(tabId))) return false;
      if (latestWorkspace.current.tabs.length === 1) {
        await prepareApprovedClose();
        closeCurrentWindow();
        return true;
      }

      const closedTab = latestWorkspace.current.tabs.find((candidate) => candidate.id === tabId);
      const result = closeDocumentTab(latestWorkspace.current, tabId, true);
      if (result.closed) {
        updateWorkspaceNow(() => result.workspace);
        if (closedTab?.session.path && closedTab.session.fileExists !== false) {
          recentlyClosedPaths.current.push(closedTab.session.path);
        }
        await releaseDocumentTab(tabId).catch((error: unknown) => setCommandError(errorMessage(error)));
      }
      return result.closed;
    } finally {
      closeTabInFlight.current = false;
    }
  }

  async function closeOtherTabs(keepId: string) {
    const others = latestWorkspace.current.tabs.filter((tab) => tab.id !== keepId);
    for (const tab of others) {
      if (!(await requestCloseTab(tab.id))) return;
    }
    selectDocumentTab(keepId);
  }

  function updateOpenMode(openMode: OpenMode) {
    touchedPreferences.current.openMode = true;
    saveOpenMode(openMode);
    persistAppSettings({ openMode });
    updateWorkspaceNow((current) => setOpenMode(current, openMode));
  }

  function toggleWordWrap() {
    touchedPreferences.current.wordWrap = true;
    const nextWordWrap = !latestWordWrap.current;
    latestWordWrap.current = nextWordWrap;
    setWordWrap(nextWordWrap);
    persistAppSettings({ wordWrap: nextWordWrap });
    void syncWordWrapMenuChecked(nextWordWrap).catch((error: unknown) => {
      setCommandError(errorMessage(error));
    });
  }

  function updateThemeSettings(next: ThemeSettings) {
    const normalized = normalizeThemeSettings(next);
    touchedPreferences.current.appearanceTheme = true;
    latestThemeSettings.current = normalized;
    saveThemeSettings(normalized);
    persistAppSettings({
      appearanceTheme: appearanceThemeIdFromThemeSettings(normalized),
      themeSettings: normalized,
    });
    setThemeSettings(normalized);
  }

  function updateThemeMode(mode: ThemeMode) {
    updateThemeSettings({
      ...latestThemeSettings.current,
      mode,
    });
  }

  function updateConstantTheme(themeId: ThemeId) {
    if (!isThemeId(themeId)) {
      return;
    }

    updateThemeSettings({
      ...latestThemeSettings.current,
      constantThemeId: themeId,
    });
  }

  function updateLightTheme(themeId: ThemeId) {
    if (!themeMatchesScheme(themeId, "light")) {
      return;
    }

    updateThemeSettings({
      ...latestThemeSettings.current,
      lightThemeId: themeId,
    });
  }

  function updateDarkTheme(themeId: ThemeId) {
    if (!themeMatchesScheme(themeId, "dark")) {
      return;
    }

    updateThemeSettings({
      ...latestThemeSettings.current,
      darkThemeId: themeId,
    });
  }

  function updateEditorFontFamily(family: EditorFontFamily) {
    touchedPreferences.current.editorFont = true;
    const next = { ...editorFontSettings, family };
    saveEditorFontSettings(next);
    persistAppSettings({ editorFontFamily: family });
    setEditorFontSettings(next);
  }

  function updateEditorFontSize(size: EditorFontSize) {
    touchedPreferences.current.editorFont = true;
    const next = { ...editorFontSettings, size };
    saveEditorFontSettings(next);
    persistAppSettings({ editorFontSize: size });
    setEditorFontSettings(next);
  }

  function promptUnsavedChanges(
    session: DocumentSession,
    signal?: AbortSignal,
  ): Promise<UnsavedChoice> {
    if (signal?.aborted) return Promise.resolve("cancel");
    onUnsavedPrompt?.();
    return new Promise((resolve) => {
      function finish(choice: UnsavedChoice) {
        signal?.removeEventListener("abort", cancel);
        resolve(choice);
      }
      function cancel() {
        finish("cancel");
        setUnsavedPrompt((current) => current?.resolve === finish ? null : current);
      }
      signal?.addEventListener("abort", cancel, { once: true });
      setUnsavedPrompt({ session, resolve: finish });
    });
  }

  function answerUnsavedPrompt(choice: UnsavedChoice) {
    unsavedPrompt?.resolve(choice);
    setUnsavedPrompt(null);
  }

  function handleOpenUpdate() {
    if (!availableUpdate) {
      return;
    }

    void openReleasePage(availableUpdate.releaseUrl).catch(() => undefined);
  }

  async function resolveDirtyTabForClose(tabId: string, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) return false;
    const tab = latestWorkspace.current.tabs.find(
      (candidate) => candidate.id === tabId,
    );
    if (!tab || !tab.session.dirty) {
      return true;
    }

    const choice = await promptUnsavedChanges(tab.session, signal);
    if (signal?.aborted) return false;
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

  function confirmClosingAllTabs(signal?: AbortSignal) {
    if (closeTabInFlight.current || signal?.aborted) return Promise.resolve(false);
    if (closeConfirmation.current) return closeConfirmation.current;
    const confirmation = resolveAllDirtyTabsForClose(signal).finally(() => {
      if (closeConfirmation.current === confirmation) closeConfirmation.current = null;
    });
    closeConfirmation.current = confirmation;
    return confirmation;
  }

  async function resolveAllDirtyTabsForClose(signal?: AbortSignal): Promise<boolean> {
    if (saveInFlight.current) await saveInFlight.current;
    if (signal?.aborted) return false;
    const dirtyTabIds = latestWorkspace.current.tabs
      .filter((tab) => tab.session.dirty)
      .map((tab) => tab.id);

    for (const tabId of dirtyTabIds) {
      const resolved = await resolveDirtyTabForClose(tabId, signal);
      if (!resolved || signal?.aborted) {
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

    const saved = await saveTab(
      tabId,
      forceSaveAs ? "Save As" : "Save",
      commandSnapshot,
      (session, id) => forceSaveAs
        ? saveDocumentAs(session, dependencies, id)
        : saveDocument(session, dependencies, id),
    );
    return saved && !latestWorkspace.current.tabs.find((tab) => tab.id === tabId)?.session.dirty;
  }

  function updateWorkspaceNow(
    update: (current: DocumentWorkspace) => DocumentWorkspace,
  ) {
    const next = update(latestWorkspace.current);
    latestWorkspace.current = next;
    setWorkspace(next);
  }

  function enqueueExternalFileChecks(tabIds: string[], encoding?: "windows1251") {
    externalCheckChain.current = externalCheckChain.current.then(async () => {
      for (const tabId of tabIds) {
        await checkExternalFileForTab(tabId, encoding);
      }
    });
  }

  async function checkExternalFileForTab(tabId: string, encoding?: "windows1251") {
    const tab = latestWorkspace.current.tabs.find(
      (candidate) => candidate.id === tabId,
    );
    if (!tab?.session.path || closingRef.current) {
      return;
    }
    const checkedSession = tab.session;

    try {
      const result = await checkExternalFileChange(checkedSession, dependencies, encoding);
      if (result.kind === "unchanged") {
        if (latestExternalFileWarning.current?.kind === "encoding") clearExternalWarningForTab(tabId);
        return;
      }

      const currentTab = latestWorkspace.current.tabs.find(
        (candidate) => candidate.id === tabId,
      );
      if (!currentTab) {
        return;
      }
      const currentSession = currentTab.session;
      if (externalCheckPolicyChanged(currentSession, checkedSession)) return;

      if (result.kind === "metadata-refresh") {
        if (sessionStillMatches(currentSession, checkedSession)) {
          updateWorkspaceNow((current) =>
            updateDocumentTab(current, tabId, () => result.session),
          );
        }
        return;
      }

      if (
        !encoding &&
        result.kind === "clean-update" &&
        result.session.externalUpdatePolicy === "follow" &&
        sessionStillMatches(currentSession, checkedSession)
      ) {
        applyExternalReloadToTab(tabId, result.external, "follow", checkedSession);
        return;
      }

      const warning = externalWarningForCurrentSession(
        tabId,
        checkedSession,
        currentSession,
        result,
      );
      if (!warning) {
        return;
      }

      if (latestWorkspace.current.activeTabId === tabId) {
        showExternalWarning(warning);
      }
    } catch (error: unknown) {
      if (error instanceof UnsupportedFileEncodingError) {
        const currentSession = latestWorkspace.current.tabs.find((entry) => entry.id === tabId)?.session;
        if (latestWorkspace.current.activeTabId === tabId && currentSession &&
          currentSession.path === checkedSession.path &&
          currentSession.savedDiskContent === checkedSession.savedDiskContent &&
          currentSession.encoding === checkedSession.encoding &&
          !externalCheckPolicyChanged(currentSession, checkedSession)) {
          showExternalWarning({ kind: "encoding", tabId });
        }
      } else if (!isExpectedExternalFileCheckError(error)) {
        logUnexpectedExternalFileCheckError(checkedSession.path, error);
      }
    }
  }

  function applyExternalReloadToTab(
    tabId: string,
    external: Extract<
      ExternalFileChangeResult,
      { kind: "clean-update" | "conflict" }
    >["external"],
    policy?: "follow",
    expectedSession?: DocumentSession,
  ) {
    updateWorkspaceNow((current) =>
      updateDocumentTab(current, tabId, (session) => {
        if (session.path !== external.path) {
          return session;
        }
        if (expectedSession && !sessionStillMatches(session, expectedSession)) {
          return session;
        }
        const reloaded = applyExternalFileReload(session, external);
        return policy ? setExternalUpdatePolicy(reloaded, policy) : reloaded;
      }),
    );
    clearExternalWarningForTab(tabId);
  }

  function markExternalUpdateHandled(
    tabId: string,
    external: Extract<ExternalFileChangeResult, { kind: "clean-update" | "conflict" }>["external"],
  ) {
    updateWorkspaceNow((current) =>
      updateDocumentTab(current, tabId, (session) =>
        markExternalUpdateNoticed(session, external.lastModifiedAt, external),
      ),
    );
    clearExternalWarningForTab(tabId);
  }

  function acknowledgeExternalDeletion(tabId: string, path: string) {
    updateWorkspaceNow((current) =>
      updateDocumentTab(current, tabId, (session) =>
        markExternalDeletionAcknowledged(session, path),
      ),
    );
    clearExternalWarningForTab(tabId);
  }

  function showExternalWarning(warning: ExternalFileWarning) {
    latestExternalFileWarning.current = warning;
    setExternalFileWarning(warning);
    setReconcileOpen(false);
  }

  function clearExternalWarningForTab(tabId: string) {
    if (latestExternalFileWarning.current?.tabId === tabId) {
      latestExternalFileWarning.current = null;
    }
    setExternalFileWarning((current) =>
      current?.tabId === tabId ? null : current,
    );
    setReconcileOpen(false);
  }

  function saveWarningTabAs(tabId: string) {
    const commandSnapshot = latestWorkspace.current.tabs.find(
      (tab) => tab.id === tabId,
    )?.session;
    if (!commandSnapshot) {
      clearExternalWarningForTab(tabId);
      return;
    }

    if (closeTabInFlight.current || closeConfirmation.current) return;
    void saveTab(tabId, "Save As", commandSnapshot, (session, id) =>
      saveDocumentAs(session, dependencies, id),
    );
  }

  function externalWarningForCurrentSession(
    tabId: string,
    checkedSession: DocumentSession,
    currentSession: DocumentSession,
    result: Exclude<
      ExternalFileChangeResult,
      { kind: "unchanged" | "metadata-refresh" }
    >,
  ): ExternalFileWarning | null {
    if (result.kind === "deleted") {
      if (currentSession.path !== checkedSession.path || !currentSession.path) {
        return null;
      }

      return {
        kind: "deleted",
        tabId,
        result: {
          kind: "deleted",
          session: currentSession,
          path: currentSession.path,
        },
      };
    }

    if (currentSession.path !== result.external.path) {
      return null;
    }

    if (sessionStillMatches(currentSession, checkedSession)) {
      if (result.kind === "clean-update") {
        return {
          kind: "clean-update",
          tabId,
          result,
        };
      }

      return {
        kind: "conflict",
        tabId,
        result,
      };
    }

    if (!currentSession.dirty) {
      return null;
    }

    return {
      kind: "conflict",
      tabId,
      result: {
        kind: "conflict",
        session: currentSession,
        external: result.external,
        base: currentSession.savedContent,
        local: currentSession.content,
      },
    };
  }

  function applyAppSettings(settings: RawPersistedAppSettings, startup: boolean) {
    const touched = touchedPreferences.current;
    if ((!startup || !touched.checkForUpdates) && typeof settings.checkForUpdates === "boolean") {
      setCheckForUpdates(settings.checkForUpdates);
    }
    if ((!startup || !touched.editorLineWidth) && settings.editorLineWidth !== undefined) {
      setEditorLineWidth(normalizeEditorLineWidth(settings.editorLineWidth));
    }
    if ((!startup || !touched.spellcheck) && settings.spellcheck !== undefined) {
      setSpellcheck(settings.spellcheck === true);
    }
    if ((!startup || !touched.allowRemoteImages) && settings.allowRemoteImages !== undefined) {
      setAllowRemoteImages(settings.allowRemoteImages === true);
    }
    if ((!startup || !touched.wordWrap) && (startup || settings.wordWrap !== undefined)) {
      const wordWrap = normalizeWordWrap(settings.wordWrap);
      latestWordWrap.current = wordWrap;
      setWordWrap(wordWrap);
      void syncWordWrapMenuChecked(wordWrap).catch((error: unknown) => setCommandError(errorMessage(error)));
    }
    if (!startup || !touched.appearanceTheme) {
      const themeSettings = parseThemeSettings(settings.themeSettings);
      const legacyTheme = isAppearanceThemeId(settings.appearanceTheme) ? settings.appearanceTheme : undefined;
      if (themeSettings || legacyTheme) {
        const next = normalizeThemeSettings(
          themeSettings ?? themeSettingsFromAppearanceThemeId(legacyTheme!, latestThemeSettings.current),
        );
        const appearanceTheme = appearanceThemeIdFromThemeSettings(next);
        latestThemeSettings.current = next;
        setThemeSettings(next);
        saveThemeSettings(next);
        saveAppearanceThemeId(appearanceTheme);
        if (startup && (!themeSettings || !themeSettingsEqual(themeSettings, next))) {
          persistAppSettings({ appearanceTheme, themeSettings: next });
        }
      }
    }
    if (!startup || !touched.editorFont) {
      const current = latestEditorFontSettings.current;
      const next = {
        family: settings.editorFontFamily?.trim() ? settings.editorFontFamily : current.family,
        size: isEditorFontSize(settings.editorFontSize) ? settings.editorFontSize : current.size,
      };
      if (next.family !== current.family || next.size !== current.size) {
        latestEditorFontSettings.current = next;
        saveEditorFontSettings(next);
        setEditorFontSettings(next);
      }
    }
    if ((!startup || !touched.openMode) && isOpenMode(settings.openMode)) {
      const openMode = settings.openMode;
      saveOpenMode(openMode);
      updateWorkspaceNow((current) => setOpenMode(current, openMode));
    }
  }

  function persistAppSettings(settings: Partial<PersistedAppSettings>) {
    pendingAppSettingsWrite.current = {
      ...(pendingAppSettingsWrite.current ?? {}),
      ...settings,
    };
    if (appSettingsReadComplete.current) return startAppSettingsWriteLoop();
  }

  function releaseAppSettingsReadBarrier() {
    if (appSettingsReadComplete.current) return;
    appSettingsReadComplete.current = true;
    if (pendingAppSettingsWrite.current) void startAppSettingsWriteLoop();
  }

  function startAppSettingsWriteLoop() {
    if (appSettingsWriteInFlight.current) return appSettingsWriteInFlight.current;

    const writeLoop = (async () => {
      while (pendingAppSettingsWrite.current) {
        const patch = pendingAppSettingsWrite.current;
        pendingAppSettingsWrite.current = null;
        try {
          await writeAppSettings(patch);
        } catch (error: unknown) {
          setCommandError(errorMessage(error));
        }
      }
    })().finally(() => {
      if (appSettingsWriteInFlight.current === writeLoop) {
        appSettingsWriteInFlight.current = null;
      }
    });
    appSettingsWriteInFlight.current = writeLoop;
    return writeLoop;
  }

  function clearPendingSwapWrite() {
    if (swapWriteTimer.current !== null) {
      window.clearTimeout(swapWriteTimer.current);
      swapWriteTimer.current = null;
    }
  }

  async function waitForSwapWrite() {
    await swapWriteChain.current;
  }

  async function waitForAppSettingsWrite() {
    if (appSettingsWriteInFlight.current) {
      await appSettingsWriteInFlight.current;
    }
  }

  async function prepareApprovedClose() {
    closingRef.current = true;
    clearPendingSwapWrite();
    await waitForSwapWrite();
    await waitForAppSettingsWrite();
    try {
      await clearSwapState();
    } catch (error: unknown) {
      setCommandError(errorMessage(error));
    }
  }

  const focusDocument = useCallback(() => documentViewRef.current?.focus(), []);

  function closeSettings() {
    setSettingsOpen(false);
  }

  function selectDocumentTab(tabId: string) {
    updateWorkspaceNow((current) => setActiveDocumentTab(current, tabId));
    if (latestExternalFileWarning.current?.tabId !== tabId) {
      latestExternalFileWarning.current = null;
    }
    setExternalFileWarning((current) =>
      current && current.tabId !== tabId ? null : current,
    );
    setReconcileOpen(false);
    enqueueExternalFileChecks([tabId]);
  }

  const tabstripHidden = workspace.openMode === "windows" && workspace.tabs.length === 1;
  const resolvedTheme = resolveTheme(themeSettings, systemScheme);
  const themeStyle = useMemo(() => ({
    ...themeToCssVariables(resolvedTheme),
    "--app-focus-foreground": focusForeground(resolvedTheme.tokens.app.focus),
  }), [resolvedTheme]);
  const editorOpenDocument = useCommittedCallback(openLinkedDocument);
  const editorMenuCommand = useCommittedCallback(runMenuCommand);
  const editorOpenUpdate = useCommittedCallback(handleOpenUpdate);
  const toggleEditorOutline = useCallback(() => {
    const tabId = latestWorkspace.current.activeTabId;
    const available = documentViewRef.current?.hasOutline();
    setOutlineTabId(current => current === tabId || !available ? null : tabId);
  }, []);
  const onTabContentChange = useCommittedCallback((tabId: string, content: string) => {
    updateWorkspaceNow((current) =>
      updateDocumentTab(current, tabId, (previous) => updateSessionContent(previous, content)),
    );
  });
  const editorScheme =
    themeSettings.mode === "constant" ? resolvedTheme.scheme : "auto";
  const appearanceThemeId = appearanceThemeIdFromThemeSettings(themeSettings);
  const appearanceTheme = getAppearanceTheme(appearanceThemeId);
  const activeExternalFileWarning =
    externalFileWarning?.tabId === workspace.activeTabId
      ? externalFileWarning
      : null;
  const reconcileResult =
    activeExternalFileWarning?.kind === "clean-update" ||
    activeExternalFileWarning?.kind === "conflict"
      ? activeExternalFileWarning.result
      : null;

  return (
    <div
      inert={quitApproved}
      className={`app-shell ${appearanceTheme.appClassName}`}
      data-testid="app-shell"
      data-tabstrip-hidden={tabstripHidden || undefined}
      style={themeStyle}
    >
      <TabStrip
        tabs={workspace.tabs}
        activeTabId={workspace.activeTabId}
        hidden={tabstripHidden}
        hasClosedTabs={recentlyClosedPaths.current.length > 0}
        onNewTab={addNewTab}
        onSelectTab={selectDocumentTab}
        onCloseTab={requestCloseTab}
        onCloseOtherTabs={closeOtherTabs}
        onReopenClosed={reopenClosedTab}
        onMoveTab={(id, target) => updateWorkspaceNow((current) => moveDocumentTab(current, id, target))}
      />

      <div className="command-error-slot">
        {commandError ? (
          <div
            className="command-error"
            role="alert"
            aria-label="File command error"
          >
            <span>{commandError}</span>
            {encodingRetry && encodingRetry.message === commandError ? (
              <button
                className="command-error-retry"
                type="button"
                onClick={() => void runOpenCommand(
                  "Open File",
                  async () => encodingRetry.path,
                  false,
                  "windows1251",
                )}
              >
                Open as Windows-1251
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Dismiss file command error"
              onClick={() => {
                setCommandError(null);
                setEncodingRetry(null);
              }}
            >
              <TbX size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      <main className="document-area">
        {recoveryNotice ? (
          <div className="external-file-banner" role="status" aria-label="Editor recovery">
            <span>{recoveryNotice}</span>
            <button
              type="button"
              className="button-secondary"
              aria-label="Dismiss recovery notice"
              onClick={() => setRecoveryNotice(null)}
            >Dismiss</button>
          </div>
        ) : null}

        {activeExternalFileWarning && !reconcileOpen ? (
          activeExternalFileWarning.kind === "encoding" ? (
            <ExternalFileBanner
              kind="encoding"
              displayName={document.displayName}
              onDecode={() => enqueueExternalFileChecks([activeExternalFileWarning.tabId], "windows1251")}
              onSaveAs={() => saveWarningTabAs(activeExternalFileWarning.tabId)}
            />
          ) : activeExternalFileWarning.kind === "deleted" ? (
            <ExternalFileBanner
              kind="deleted"
              displayName={document.displayName}
              onKeepEditing={() =>
                acknowledgeExternalDeletion(
                  activeExternalFileWarning.tabId,
                  activeExternalFileWarning.result.path,
                )
              }
              onSaveAs={() => saveWarningTabAs(activeExternalFileWarning.tabId)}
            />
          ) : (
            <ExternalFileBanner
              kind={activeExternalFileWarning.kind}
              displayName={document.displayName}
              onReload={() =>
                applyExternalReloadToTab(
                  activeExternalFileWarning.tabId,
                  activeExternalFileWarning.result.external,
                )
              }
              onFollow={
                activeExternalFileWarning.kind === "clean-update"
                  ? () =>
                      applyExternalReloadToTab(
                        activeExternalFileWarning.tabId,
                        activeExternalFileWarning.result.external,
                        "follow",
                      )
                  : undefined
              }
              onKeepAsking={
                activeExternalFileWarning.kind === "clean-update"
                  ? () =>
                      markExternalUpdateHandled(
                        activeExternalFileWarning.tabId,
                        activeExternalFileWarning.result.external,
                      )
                  : undefined
              }
              onKeepEditing={() =>
                markExternalUpdateHandled(
                  activeExternalFileWarning.tabId,
                  activeExternalFileWarning.result.external,
                )
              }
              onSaveAs={
                activeExternalFileWarning.kind === "conflict"
                  ? () => saveWarningTabAs(activeExternalFileWarning.tabId)
                  : undefined
              }
              onReconcile={() => setReconcileOpen(true)}
            />
          )
        ) : null}

        {reconcileOpen && activeExternalFileWarning && reconcileResult ? (
          <ExternalReconcileView
            title={document.displayName}
            currentLabel="Current in Galley Pad"
            incomingLabel="Incoming from disk"
            currentContent={document.content}
            incomingContent={reconcileResult.external.content}
            onClose={() => setReconcileOpen(false)}
            onReload={() =>
              applyExternalReloadToTab(
                activeExternalFileWarning.tabId,
                reconcileResult.external,
              )
            }
            onSaveAs={() => saveWarningTabAs(activeExternalFileWarning.tabId)}
          />
        ) : null}

        {workspace.tabs.map((tab) => {
          const selected = tab.id === workspace.activeTabId;
          const visible = selected && !(reconcileOpen && activeExternalFileWarning && reconcileResult);
          const session = tab.session;

          return (
            <RetainedDocumentPane
              key={tab.id}
              editorRef={visible ? documentViewRef : undefined}
              active={visible}
              path={session.path}
              wordWrap={wordWrap}
              content={session.content}
              tabId={tab.id}
              panelId={tabPanelId(tab.id)}
              labelledBy={tabstripHidden ? undefined : tabButtonId(tab.id)}
              toolbarVisible={toolbarVisible}
              editorScheme={editorScheme}
              editorStyle={themeStyle}
              fontSettings={editorFontSettings}
              lineWidth={editorLineWidth}
              spellcheck={spellcheck}
              allowRemoteImages={allowRemoteImages}
              outlineOpen={visible && outlineOpen}
              onToggleOutline={toggleEditorOutline}
              onOpenDocument={editorOpenDocument}
              onLinkError={setCommandError}
              onMenuCommand={editorMenuCommand}
              updateReleaseUrl={checkForUpdates ? availableUpdate?.releaseUrl : undefined}
              onOpenUpdate={editorOpenUpdate}
              status={
                selected && pendingCommand
                  ? `${pendingCommand}...`
                  : session.path && session.fileExists === false
                    ? "New file — will be created on save"
                    : session.dirty
                      ? "Unsaved"
                      : session.path
                        ? "Saved"
                        : "Draft"
              }
              onTabContentChange={onTabContentChange}
            />
          );
        })}
      </main>

      {recentFiles ? (
        <RecentFilesDialog
          paths={recentFiles}
          onClose={() => setRecentFiles(null)}
          onOpen={(path) => {
            setRecentFiles(null);
            void openExternalFile(path);
          }}
          onRemove={(path) => {
            setRecentFiles((current) => current?.filter((entry) => entry !== path) ?? null);
            void updateRecentFile(path, false).catch((error: unknown) => setCommandError(errorMessage(error)));
          }}
        />
      ) : null}
      <SettingsDialog
        open={settingsOpen}
        openMode={workspace.openMode}
        themeSettings={themeSettings}
        editorLineWidth={editorLineWidth}
        spellcheck={spellcheck}
        allowRemoteImages={allowRemoteImages}
        checkForUpdates={checkForUpdates}
        editorFontSettings={editorFontSettings}
        updateOpenMode={updateOpenMode}
        updateThemeMode={updateThemeMode}
        updateConstantTheme={updateConstantTheme}
        updateLightTheme={updateLightTheme}
        updateDarkTheme={updateDarkTheme}
        updateLineWidth={(width) => {
          touchedPreferences.current.editorLineWidth = true;
          setEditorLineWidth(width);
          persistAppSettings({ editorLineWidth: width });
        }}
        updateSpellcheck={(enabled) => {
          touchedPreferences.current.spellcheck = true;
          setSpellcheck(enabled);
          persistAppSettings({ spellcheck: enabled });
        }}
        updateAllowRemoteImages={(enabled) => {
          touchedPreferences.current.allowRemoteImages = true;
          setAllowRemoteImages(enabled);
          persistAppSettings({ allowRemoteImages: enabled });
        }}
        updateCheckForUpdates={(enabled) => {
          touchedPreferences.current.checkForUpdates = true;
          setCheckForUpdates(enabled);
          persistAppSettings({ checkForUpdates: enabled });
        }}
        updateEditorFontFamily={updateEditorFontFamily}
        updateEditorFontSize={updateEditorFontSize}
        focusFallback={focusDocument}
        onClose={closeSettings}
      />

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

function useCommittedCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
  const latest = useRef(callback);
  useLayoutEffect(() => {
    latest.current = callback;
  }, [callback]);
  return useCallback((...args: Args) => latest.current(...args), []);
}

function sessionStillMatches(
  current: DocumentSession,
  snapshot: DocumentSession,
): boolean {
  return (
    !externalCheckPolicyChanged(current, snapshot) &&
    current.id === snapshot.id &&
    current.path === snapshot.path &&
    current.content === snapshot.content &&
    current.savedContent === snapshot.savedContent &&
    current.savedDiskContent === snapshot.savedDiskContent &&
    current.fileExists === snapshot.fileExists &&
    current.encoding === snapshot.encoding &&
    current.dirty === snapshot.dirty &&
    current.lineEnding === snapshot.lineEnding &&
    current.lastKnownModifiedAt === snapshot.lastKnownModifiedAt &&
    current.lastNoticedExternalModifiedAt ===
      snapshot.lastNoticedExternalModifiedAt &&
    current.lastNoticedExternalContent === snapshot.lastNoticedExternalContent
  );
}

function externalCheckPolicyChanged(current: DocumentSession, snapshot: DocumentSession): boolean {
  return current.externalUpdatePolicy !== snapshot.externalUpdatePolicy ||
    current.acknowledgedDeletedPath !== snapshot.acknowledgedDeletedPath;
}

function isExpectedExternalFileCheckError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return [
    "enoent",
    "eacces",
    "eperm",
    "ebusy",
    "not found",
    "no such file",
    "does not exist",
    "permission denied",
    "access denied",
    "resource busy",
    "temporary",
  ].some((pattern) => message.includes(pattern));
}

function logUnexpectedExternalFileCheckError(
  path: string | null,
  error: unknown,
) {
  console.error("Unexpected external file check failure", {
    path,
    error,
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getSystemScheme(): ThemeScheme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function themeSettingsFromAppearanceThemeId(
  themeId: AppearanceThemeId,
  current: ThemeSettings,
): ThemeSettings {
  if (themeId === "system") {
    return {
      ...current,
      mode: "system",
    };
  }

  return {
    ...current,
    mode: "constant",
    constantThemeId: themeId,
  };
}

function appearanceThemeIdFromThemeSettings(
  settings: ThemeSettings,
): AppearanceThemeId {
  if (settings.mode !== "constant") {
    return "system";
  }

  if (
    settings.constantThemeId === "galley-light" ||
    settings.constantThemeId === "galley-dark"
  ) {
    return settings.constantThemeId;
  }

  return resolveTheme(settings, "light").scheme === "dark"
    ? "galley-dark"
    : "galley-light";
}

function isAppearanceThemeId(value: unknown): value is AppearanceThemeId {
  return (
    value === "system" ||
    value === "galley-light" ||
    value === "galley-dark"
  );
}

function loadNormalizedThemeSettings(): ThemeSettings {
  const settings = loadThemeSettings();
  const normalized = normalizeThemeSettings(settings);
  if (!themeSettingsEqual(settings, normalized)) {
    saveThemeSettings(normalized);
  }
  return normalized;
}

function normalizeThemeSettings(settings: ThemeSettings): ThemeSettings {
  return {
    ...settings,
    lightThemeId: themeMatchesScheme(settings.lightThemeId, "light")
      ? settings.lightThemeId
      : DEFAULT_LIGHT_THEME_ID,
    darkThemeId: themeMatchesScheme(settings.darkThemeId, "dark")
      ? settings.darkThemeId
      : DEFAULT_DARK_THEME_ID,
  };
}

function themeSettingsEqual(left: ThemeSettings, right: ThemeSettings): boolean {
  return (
    left.mode === right.mode &&
    left.constantThemeId === right.constantThemeId &&
    left.lightThemeId === right.lightThemeId &&
    left.darkThemeId === right.darkThemeId
  );
}

function themeMatchesScheme(themeId: ThemeId, scheme: ThemeScheme): boolean {
  return listThemesByScheme(scheme).some((theme) => theme.id === themeId);
}

function isEditorFontSize(value: unknown): value is EditorFontSize {
  return value === "small" || value === "medium" || value === "large";
}

function isOpenMode(value: unknown): value is OpenMode {
  return value === "tabs" || value === "windows";
}
