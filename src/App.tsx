import {
  Suspense,
  lazy,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  TbChevronLeft,
  TbChevronRight,
  TbList,
  TbPlus,
  TbX,
} from "react-icons/tb";
import {
  DocumentView,
  type DocumentViewHandle,
} from "./components/DocumentView";
import { APP_VERSION } from "./appInfo";
import { ExternalFileBanner } from "./components/ExternalFileBanner";
import { ExternalReconcileView } from "./components/ExternalReconcileView";
import { RecentFilesDialog } from "./components/RecentFilesDialog";
import { TabActionsMenu } from "./components/TabActionsMenu";
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
import { computeTabPathHints } from "./document/tabLabels";
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
  EDITOR_FONT_SIZES,
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
import { EDITOR_LINE_WIDTHS, normalizeEditorLineWidth } from "./settings/reading";
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
import { listenForAppQuit } from "./tauri/appQuit";
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
  listenForWindowCloseRequest,
} from "./tauri/windowClose";
import {
  listSystemFonts,
  type SystemFont,
  type SystemFontCatalog,
} from "./tauri/systemFonts";
import {
  BUILT_IN_THEMES,
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

const FontPicker = lazy(() => import("./components/FontPicker").then(
  ({ FontPicker }) => ({ default: FontPicker }),
));

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
  const [quitApproved, setQuitApproved] = useState(false);
  const quitApprovedRef = useRef(false);
  const closeConfirmation = useRef<Promise<boolean> | null>(null);
  const [pendingCommand, setPendingCommand] = useState<CommandName | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [encodingRetry, setEncodingRetry] = useState<UnsupportedFileEncodingError | null>(null);
  const [availableUpdate, setAvailableUpdate] =
    useState<AvailableUpdate | null>(null);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [editorLineWidth, setEditorLineWidth] = useState(() => normalizeEditorLineWidth(null));
  const [spellcheck, setSpellcheck] = useState(false);
  const [allowRemoteImages, setAllowRemoteImages] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<string[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(() =>
    loadNormalizedThemeSettings(),
  );
  const [systemScheme, setSystemScheme] = useState<ThemeScheme>(() =>
    getSystemScheme(),
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
  const [tabActions, setTabActions] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const draggingTab = useRef<string | null>(null);
  const recentlyClosedPaths = useRef<string[]>([]);
  const closeTabInFlight = useRef(false);
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [tabScrollState, setTabScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  });
  const [unsavedPrompt, setUnsavedPrompt] = useState<UnsavedPromptState | null>(
    null,
  );
  const [externalFileWarning, setExternalFileWarning] =
    useState<ExternalFileWarning | null>(null);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const latestWorkspace = useRef(workspace);
  const latestExternalFileWarning = useRef(externalFileWarning);
  const latestThemeSettings = useRef(themeSettings);
  const latestEditorFontSettings = useRef(editorFontSettings);
  const latestWordWrap = useRef(wordWrap);
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
    editorLineWidth: false,
    spellcheck: false,
    allowRemoteImages: false,
    appearanceTheme: false,
    editorFont: false,
    openMode: false,
    wordWrap: false,
  });
  const settingsDialogRef = useRef<HTMLDialogElement>(null);
  const unsavedDialogRef = useRef<HTMLDialogElement>(null);
  const settingsReturnFocusRef = useRef<HTMLElement | null>(null);
  const tabMenuRef = useRef<HTMLDivElement>(null);
  const tabScrollerRef = useRef<HTMLDivElement>(null);
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

  latestWorkspace.current = workspace;
  latestExternalFileWarning.current = externalFileWarning;
  latestThemeSettings.current = themeSettings;
  latestEditorFontSettings.current = editorFontSettings;
  const activeTab = getActiveDocumentTab(workspace);
  const document = activeTab.session;
  const activeTabIndex = workspace.tabs.indexOf(activeTab);

  useEffect(() => {
    const title = `${document.dirty ? "* " : ""}${document.displayName} - Galley Pad`;
    globalThis.document.title = title;
    if ("__TAURI_INTERNALS__" in globalThis) {
      void setCurrentWindowTitle(title).catch((error: unknown) => setCommandError(errorMessage(error)));
    }
  }, [document.dirty, document.displayName]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      globalThis.document.getElementById(tabButtonId(workspace.activeTabId))
        ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workspace.activeTabId, activeTabIndex]);

  useEffect(() => {
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
  }, []);

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
      latestExternalFileWarning.current = warning;
      setExternalFileWarning(warning);
      setReconcileOpen(false);
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
    if (!tabMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        tabMenuRef.current &&
        !tabMenuRef.current.contains(target)
      ) {
        setTabMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setTabMenuOpen(false);
      }
    }

    globalThis.document.addEventListener("pointerdown", handlePointerDown);
    globalThis.document.addEventListener("keydown", handleKeyDown);

    return () => {
      globalThis.document.removeEventListener("pointerdown", handlePointerDown);
      globalThis.document.removeEventListener("keydown", handleKeyDown);
    };
  }, [tabMenuOpen]);

  useEffect(() => {
    const tabScroller = tabScrollerRef.current;
    if (!tabScroller) {
      return;
    }
    const scroller: HTMLDivElement = tabScroller;

    function updateTabScrollState() {
      const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
      setTabScrollState({
        canScrollLeft: scroller.scrollLeft > 0,
        canScrollRight: scroller.scrollLeft < maxScrollLeft - 1,
      });
    }

    updateTabScrollState();
    scroller.addEventListener("scroll", updateTabScrollState, { passive: true });
    globalThis.addEventListener("resize", updateTabScrollState);

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateTabScrollState);
    observer?.observe(scroller);

    return () => {
      scroller.removeEventListener("scroll", updateTabScrollState);
      globalThis.removeEventListener("resize", updateTabScrollState);
      observer?.disconnect();
    };
  }, [workspace.tabs.length]);

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
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    void readSwapState()
      .then(async (swap) => {
        if (disposed || !swap || getWindowMarkdownFileOpen()) return;
        const restored = await restoreWorkspaceFromSwap(swap, {
          claim: claimDocumentPath,
          release: releaseDocumentTab,
          read: readTextFile,
        });
        if (!disposed && restored) {
          setWorkspace(restored.workspace);
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
        await openFileInCurrentWindow(windowLaunchPath, allowMissing);
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
    void listenForDocumentActivation((tabId) => {
      setWorkspace((current) => setActiveDocumentTab(current, tabId));
    }).then((remove) => {
      if (disposed) remove();
      else unlisten = remove;
    });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;

    void listenForWindowCloseRequest(async () => {
      if (quitApprovedRef.current) return false;
      const canClose = await confirmClosingAllTabs();
      if (canClose) {
        await prepareApprovedClose();
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
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listenForAppQuit({
      confirm: async () => {
        const confirmed = await confirmClosingAllTabs();
        if (confirmed) {
          quitApprovedRef.current = true;
          setQuitApproved(true);
        }
        return confirmed;
      },
      clear: prepareApprovedClose,
      cancelled: () => {
        quitApprovedRef.current = false;
        setQuitApproved(false);
      },
      onError: (error) => setCommandError(errorMessage(error)),
    }).then((remove) => {
      if (disposed) remove();
      else unlisten = remove;
    }).catch((error: unknown) => setCommandError(errorMessage(error)));
    return () => { disposed = true; unlisten?.(); };
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

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === "o") {
        event.preventDefault();
        setOutlineOpen((open) => !open);
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
      if (
        settingsReturnFocusRef.current?.isConnected &&
        settingsReturnFocusRef.current !== globalThis.document.body
      ) {
        settingsReturnFocusRef.current.focus();
      } else {
        documentViewRef.current?.focus();
      }
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
    if (latestWorkspace.current.openMode === "windows" && "__TAURI_INTERNALS__" in globalThis) {
      void runOpenWindowCommand("New", openDraftWindow);
      return;
    }
    setWorkspace((current) => addDocumentTab(current));
  }

  async function runOpenCommand(
    name: CommandName,
    pickPath: () => Promise<string | null>,
    allowMissing = false,
    encoding?: "windows1251",
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
        setWorkspace((current) => setActiveDocumentTab(current, alreadyOpen.id));
        if (alreadyOpen.session.fileExists !== false) rememberRecentDocument(requestedPath);
        return;
      }
      const path = await claimDocumentPath(requestedPath, tabId);
      if (!path) return;
      claimed = true;
      const next = await openDocumentPath(path, dependencies, { allowMissing, encoding });
      setWorkspace((current) => openDocumentTab(current, next, tabId));
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
      (activeWarning.kind === "deleted" || activeWarning.kind === "conflict")
    ) {
      setReconcileOpen(false);
      setCommandError(
        activeWarning.kind === "deleted"
          ? "The file was deleted on disk. Use Save As to preserve your changes."
          : "The file changed on disk. Reconcile, reload, or use Save As before saving.",
      );
      return;
    }

    setCommandError(null);
    setPendingCommand(name);

    void command(commandSnapshot, tabId)
      .then(async (next) => {
        if (next) {
          if (!latestWorkspace.current.tabs.some((tab) => tab.id === tabId)) {
            await releaseDocumentTab(tabId);
            return;
          }
          updateWorkspaceNow((current) =>
            updateDocumentTab(current, tabId, (currentSession) =>
              applySaveResult(commandSnapshot, next, currentSession),
            ),
          );
          clearExternalWarningForTab(tabId);
          if (next.path) rememberRecentDocument(next.path);
        }
      })
      .catch((error: unknown) => {
        setCommandError(errorMessage(error));
      })
      .finally(() => {
        setPendingCommand(null);
      });
  }

  function rememberRecentDocument(path: string) {
    void updateRecentFile(path, true).catch((error: unknown) => {
      console.warn("Could not update recent files", error);
    });
  }

  function openExternalFile(path: string, allowMissing = false): Promise<void> {
    if (quitApprovedRef.current) return Promise.resolve();
    if (latestWorkspace.current.openMode === "windows") {
      return runOpenWindowCommand("Open File", () =>
        allowMissing ? openMarkdownFileWindow(path, true) : openMarkdownFileWindow(path)
      );
    }
    return openFileInCurrentWindow(path, allowMissing);
  }

  function openFileInCurrentWindow(path: string, allowMissing = false) {
    return runOpenCommand("Open File", async () => path, allowMissing);
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
        setOutlineOpen((open) => !open);
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
      if (!(await resolveDirtyTabForClose(tabId))) return false;
      if (latestWorkspace.current.tabs.length === 1) {
        await prepareApprovedClose();
        closeCurrentWindow();
        return true;
      }

      const closedTab = latestWorkspace.current.tabs.find((candidate) => candidate.id === tabId);
      const result = closeDocumentTab(latestWorkspace.current, tabId, true);
      if (result.closed) {
        latestWorkspace.current = result.workspace;
        setWorkspace(result.workspace);
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

  function moveTabBy(tabId: string, delta: number) {
    setWorkspace((current) => {
      const index = current.tabs.findIndex((tab) => tab.id === tabId);
      const target = current.tabs[index + delta];
      return target ? moveDocumentTab(current, tabId, target.id) : current;
    });
  }

  function handleTabMouseDown(
    event: ReactMouseEvent<HTMLElement>,
    tabId: string,
    closeMenu = false,
  ) {
    if (event.button !== 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (closeMenu) {
      setTabMenuOpen(false);
    }
    void requestCloseTab(tabId);
  }

  function updateOpenMode(openMode: OpenMode) {
    touchedPreferences.current.openMode = true;
    saveOpenMode(openMode);
    persistAppSettings({ openMode });
    setWorkspace((current) => setOpenMode(current, openMode));
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

  function promptUnsavedChanges(session: DocumentSession): Promise<UnsavedChoice> {
    onUnsavedPrompt?.();
    return new Promise((resolve) => {
      setUnsavedPrompt({ session, resolve });
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

  function confirmClosingAllTabs() {
    if (closeConfirmation.current) return closeConfirmation.current;
    const confirmation = resolveAllDirtyTabsForClose().finally(() => {
      if (closeConfirmation.current === confirmation) closeConfirmation.current = null;
    });
    closeConfirmation.current = confirmation;
    return confirmation;
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
        ? await saveDocumentAs(commandSnapshot, dependencies, tabId)
        : await saveDocument(commandSnapshot, dependencies, tabId);

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
      clearExternalWarningForTab(tabId);
      return true;
    } catch (error: unknown) {
      setCommandError(errorMessage(error));
      return false;
    } finally {
      setPendingCommand(null);
    }
  }

  function updateWorkspaceNow(
    update: (current: DocumentWorkspace) => DocumentWorkspace,
  ) {
    setWorkspace((current) => {
      const next = update(current);
      latestWorkspace.current = next;
      return next;
    });
  }

  function enqueueExternalFileChecks(tabIds: string[]) {
    externalCheckChain.current = externalCheckChain.current.then(async () => {
      for (const tabId of tabIds) {
        await checkExternalFileForTab(tabId);
      }
    });
  }

  async function checkExternalFileForTab(tabId: string) {
    const tab = latestWorkspace.current.tabs.find(
      (candidate) => candidate.id === tabId,
    );
    if (!tab?.session.path || closingRef.current) {
      return;
    }
    const checkedSession = tab.session;

    try {
      const result = await checkExternalFileChange(checkedSession, dependencies);
      if (result.kind === "unchanged") {
        return;
      }

      const currentTab = latestWorkspace.current.tabs.find(
        (candidate) => candidate.id === tabId,
      );
      if (!currentTab) {
        return;
      }
      const currentSession = currentTab.session;

      if (result.kind === "metadata-refresh") {
        if (sessionStillMatches(currentSession, checkedSession)) {
          updateWorkspaceNow((current) =>
            updateDocumentTab(current, tabId, () => result.session),
          );
        }
        return;
      }

      if (
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
        latestExternalFileWarning.current = warning;
        setExternalFileWarning(warning);
        setReconcileOpen(false);
      }
    } catch (error: unknown) {
      if (!isExpectedExternalFileCheckError(error)) {
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

    setCommandError(null);
    setPendingCommand("Save As");

    void saveDocumentAs(commandSnapshot, dependencies, tabId)
      .then(async (next) => {
        if (!next) {
          return;
        }

        if (!latestWorkspace.current.tabs.some((tab) => tab.id === tabId)) {
          await releaseDocumentTab(tabId);
          return;
        }

        updateWorkspaceNow((current) =>
          updateDocumentTab(current, tabId, (currentSession) =>
            applySaveResult(commandSnapshot, next, currentSession),
          ),
        );
        clearExternalWarningForTab(tabId);
      })
      .catch((error: unknown) => {
        setCommandError(errorMessage(error));
      })
      .finally(() => {
        setPendingCommand(null);
      });
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
      setWorkspace((current) => {
        const next = setOpenMode(current, openMode);
        latestWorkspace.current = next;
        return next;
      });
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

  function closeSettings() {
    setSettingsOpen(false);
  }

  function selectDocumentTab(tabId: string) {
    setWorkspace((current) => setActiveDocumentTab(current, tabId));
    if (latestExternalFileWarning.current?.tabId !== tabId) {
      latestExternalFileWarning.current = null;
    }
    setExternalFileWarning((current) =>
      current && current.tabId !== tabId ? null : current,
    );
    setReconcileOpen(false);
    setTabMenuOpen(false);
    enqueueExternalFileChecks([tabId]);
  }

  function handleTabKeys(event: ReactKeyboardEvent<HTMLDivElement>) {
    const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('button[role="tab"]');
    if (!tab || event.metaKey || event.ctrlKey || event.altKey) return;
    const index = workspace.tabs.findIndex(({ id }) => tab.id === tabButtonId(id));
    let next: number;
    switch (event.key) {
      case "ArrowLeft": next = (index - 1 + workspace.tabs.length) % workspace.tabs.length; break;
      case "ArrowRight": next = (index + 1) % workspace.tabs.length; break;
      case "Home": next = 0; break;
      case "End": next = workspace.tabs.length - 1; break;
      case "ContextMenu":
      case "F10": {
        if (event.key === "F10" && !event.shiftKey) return;
        const rect = tab.getBoundingClientRect();
        event.preventDefault();
        setTabActions({ tabId: workspace.tabs[index].id, x: rect.left, y: rect.bottom });
        return;
      }
      default: return;
    }

    event.preventDefault();
    const target = workspace.tabs[next];
    selectDocumentTab(target.id);
    window.requestAnimationFrame(() => globalThis.document.getElementById(tabButtonId(target.id))?.focus());
  }

  const dismissTabActions = useCallback((restoreFocus: boolean) => {
    if (restoreFocus && tabActions) {
      globalThis.document.getElementById(tabButtonId(tabActions.tabId))?.focus();
    }
    setTabActions(null);
  }, [tabActions]);

  function scrollTabs(direction: "left" | "right") {
    const scroller = tabScrollerRef.current;
    if (!scroller) {
      return;
    }

    scroller.scrollBy({
      left: (direction === "left" ? -1 : 1) * Math.max(160, scroller.clientWidth * 0.75),
      behavior: "smooth",
    });
  }

  const tabPathHints = computeTabPathHints(
    workspace.tabs.map((tab) => ({
      id: tab.id,
      displayName: tab.session.displayName,
      path: tab.session.path,
    })),
  );
  const untitledTabs = workspace.tabs.filter(({ session }) => !session.path);
  if (untitledTabs.length > 1) {
    untitledTabs.forEach(({ id }, index) => {
      tabPathHints.set(id, `Draft ${index + 1}`);
    });
  }
  const tabstripHidden = workspace.openMode === "windows" && workspace.tabs.length === 1;
  const tabAccessibleName = (tabId: string, displayName: string) => {
    const tab = workspace.tabs.find(({ id }) => tabId === id);
    return [displayName, tabPathHints.get(tabId), tab?.session.dirty ? "Unsaved changes" : null]
      .filter(Boolean).join(" — ");
  };
  const resolvedTheme = resolveTheme(themeSettings, systemScheme);
  const themeStyle = {
    ...themeToCssVariables(resolvedTheme),
    "--app-focus-foreground": focusForeground(resolvedTheme.tokens.app.focus),
  };
  const editorScheme =
    themeSettings.mode === "constant" ? resolvedTheme.scheme : "auto";
  const appearanceThemeId = appearanceThemeIdFromThemeSettings(themeSettings);
  const appearanceTheme = getAppearanceTheme(appearanceThemeId);
  const lightThemes = listThemesByScheme("light");
  const darkThemes = listThemesByScheme("dark");
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
      <nav className="tabstrip" aria-label="Open documents" hidden={tabstripHidden}>
        <div className="tabstrip-menu" ref={tabMenuRef}>
          <button
            type="button"
            className="tabstrip-action"
            aria-label="Show tabs"
            aria-haspopup="menu"
            aria-expanded={tabMenuOpen}
            onClick={() => setTabMenuOpen((open) => !open)}
          >
            <TbList size={15} strokeWidth={2} aria-hidden="true" />
          </button>
          {tabMenuOpen ? (
            <div className="tab-menu" role="menu" aria-label="Open tabs">
              <ul>
                {workspace.tabs.map((tab) => (
                  <li
                    className={
                      tab.id === workspace.activeTabId
                        ? "tab-menu-item tab-menu-item-active"
                        : "tab-menu-item"
                    }
                    key={tab.id}
                    onMouseDown={(event) =>
                      handleTabMouseDown(event, tab.id, true)
                    }
                  >
                    <button
                      type="button"
                      className="tab-menu-select"
                      role="menuitem"
                      aria-label={tabAccessibleName(
                        tab.id,
                        tab.session.displayName,
                      )}
                      onClick={() => selectDocumentTab(tab.id)}
                    >
                      <span>{tab.session.displayName}</span>
                      {tabPathHints.get(tab.id) ? (
                        <span className="tab-path-hint" aria-hidden="true">
                          {tabPathHints.get(tab.id)}
                        </span>
                      ) : null}
                      {tab.session.dirty ? <span aria-hidden="true"> *</span> : null}
                    </button>
                    <button
                      type="button"
                      className="tab-menu-close"
                      aria-label={`Close ${tab.session.displayName}`}
                      onClick={() => void requestCloseTab(tab.id)}
                    >
                      <TbX size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div
          className="tabstrip-tabs"
          role="tablist"
          aria-label="Open documents"
          ref={tabScrollerRef}
          onKeyDown={handleTabKeys}
        >
          {workspace.tabs.map((tab) => (
            <div
              className={
                tab.id === workspace.activeTabId ? "tab tab-active" : "tab"
              }
              key={tab.id}
              draggable
              data-drop-target={dropTarget === tab.id || undefined}
              onContextMenu={(event) => {
                event.preventDefault();
                setTabActions({ tabId: tab.id, x: event.clientX, y: event.clientY });
              }}
              onDragStart={(event) => {
                draggingTab.current = tab.id;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-galley-pad-tab", tab.id);
              }}
              onDragOver={(event) => {
                if (!draggingTab.current) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTarget(draggingTab.current === tab.id ? null : tab.id);
              }}
              onDrop={(event) => {
                if (!draggingTab.current) return;
                event.preventDefault();
                const moved = draggingTab.current;
                draggingTab.current = null;
                setDropTarget(null);
                setWorkspace((current) => moveDocumentTab(current, moved, tab.id));
              }}
              onDragEnd={() => {
                draggingTab.current = null;
                setDropTarget(null);
              }}
              onMouseDown={(event) => handleTabMouseDown(event, tab.id)}
            >
              <button
                type="button"
                role="tab"
                id={tabButtonId(tab.id)}
                aria-controls={tabPanelId(tab.id)}
                aria-label={tabAccessibleName(tab.id, tab.session.displayName)}
                aria-selected={tab.id === workspace.activeTabId}
                tabIndex={tab.id === workspace.activeTabId ? 0 : -1}
                onClick={() => selectDocumentTab(tab.id)}
              >
                <span aria-hidden="true">{tab.session.displayName}</span>
                {tabPathHints.get(tab.id) ? (
                  <span className="tab-path-hint" aria-hidden="true">
                    {tabPathHints.get(tab.id)}
                  </span>
                ) : null}
                {tab.session.dirty ? <span aria-hidden="true"> *</span> : null}
              </button>
              <button
                type="button"
                className="tab-close"
                aria-label={`Close ${tab.session.displayName}`}
                onClick={() => void requestCloseTab(tab.id)}
              >
                <TbX size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="tabstrip-action"
          aria-label="Scroll tabs left"
          disabled={!tabScrollState.canScrollLeft}
          onClick={() => scrollTabs("left")}
        >
          <TbChevronLeft size={15} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="tabstrip-action"
          aria-label="Scroll tabs right"
          disabled={!tabScrollState.canScrollRight}
          onClick={() => scrollTabs("right")}
        >
          <TbChevronRight size={15} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="tabstrip-action"
          aria-label="New tab"
          onClick={addNewTab}
        >
          <TbPlus size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </nav>

      {tabActions ? (
        <TabActionsMenu
          x={tabActions.x}
          y={tabActions.y}
          onDismiss={dismissTabActions}
          actions={[
            { label: "Close tab", run: () => void requestCloseTab(tabActions.tabId) },
            { label: "Close other tabs", run: () => void closeOtherTabs(tabActions.tabId), disabled: workspace.tabs.length < 2 },
            { label: "Reopen closed tab", run: reopenClosedTab, disabled: recentlyClosedPaths.current.length === 0 },
            { label: "Move tab left", run: () => moveTabBy(tabActions.tabId, -1), disabled: workspace.tabs[0]?.id === tabActions.tabId },
            { label: "Move tab right", run: () => moveTabBy(tabActions.tabId, 1), disabled: workspace.tabs[workspace.tabs.length - 1]?.id === tabActions.tabId },
          ]}
        />
      ) : null}

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
          activeExternalFileWarning.kind === "deleted" ? (
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
            <DocumentView
              key={tab.id}
              ref={visible ? documentViewRef : undefined}
              active={visible}
              path={session.path}
              wordWrap={wordWrap}
              content={session.content}
              documentKey={tab.id}
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
              onToggleOutline={() => setOutlineOpen((open) => !open)}
              onOpenDocument={openExternalFile}
              onLinkError={setCommandError}
              onMenuCommand={runMenuCommand}
              updateReleaseUrl={availableUpdate?.releaseUrl}
              onOpenUpdate={handleOpenUpdate}
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
              onContentChange={(content) =>
                setWorkspace((current) =>
                  updateDocumentTab(current, tab.id, (previous) =>
                    updateSessionContent(previous, content),
                  ),
                )
              }
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
              <TbX size={16} strokeWidth={2} aria-hidden="true" />
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
            <label>
              <input
                type="radio"
                name="theme-mode"
                checked={themeSettings.mode === "constant"}
                onChange={() => updateThemeMode("constant")}
              />
              Constant
            </label>
            {themeSettings.mode === "constant" ? (
              <label className="settings-field">
                Theme
                <select
                  aria-label="Theme"
                  value={themeSettings.constantThemeId}
                  onChange={(event) =>
                    updateConstantTheme(event.currentTarget.value)
                  }
                >
                  {BUILT_IN_THEMES.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {themeOptionLabel(theme)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              <input
                type="radio"
                name="theme-mode"
                checked={themeSettings.mode === "system"}
                onChange={() => updateThemeMode("system")}
              />
              System-based
            </label>
            {themeSettings.mode === "system" ? (
              <>
                <label className="settings-field">
                  Light theme
                  <select
                    aria-label="Light theme"
                    value={themeSettings.lightThemeId}
                    onChange={(event) =>
                      updateLightTheme(event.currentTarget.value)
                    }
                  >
                    {lightThemes.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {themeOptionLabel(theme)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  Dark theme
                  <select
                    aria-label="Dark theme"
                    value={themeSettings.darkThemeId}
                    onChange={(event) =>
                      updateDarkTheme(event.currentTarget.value)
                    }
                  >
                    {darkThemes.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {themeOptionLabel(theme)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            <label>
              <input
                type="radio"
                name="theme-mode"
                checked={themeSettings.mode === "native"}
                disabled
                readOnly
                aria-describedby="native-theme-help"
              />
              Native
            </label>
            <p className="settings-help" id="native-theme-help">
              Native shell colors are not available yet.
            </p>
          </fieldset>
          <fieldset>
            <legend>Reading</legend>
            <label className="settings-field">
              <span className="settings-field-label">Reading width</span>
              <select
                value={editorLineWidth}
                onChange={(event) => {
                  const width = normalizeEditorLineWidth(Number(event.target.value));
                  touchedPreferences.current.editorLineWidth = true;
                  setEditorLineWidth(width);
                  persistAppSettings({ editorLineWidth: width });
                }}
              >
                {EDITOR_LINE_WIDTHS.map((width) => (
                  <option key={width} value={width}>
                    {width === 0 ? "Full width" : `${width} characters`}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              <input
                type="checkbox"
                checked={spellcheck}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  touchedPreferences.current.spellcheck = true;
                  setSpellcheck(enabled);
                  persistAppSettings({ spellcheck: enabled });
                }}
              />
              Spellcheck
            </label>
            <label className="settings-field">
              <input
                type="checkbox"
                checked={allowRemoteImages}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  touchedPreferences.current.allowRemoteImages = true;
                  setAllowRemoteImages(enabled);
                  persistAppSettings({ allowRemoteImages: enabled });
                }}
              />
              Load remote HTTPS images
            </label>
          </fieldset>
          <fieldset>
            <legend>Editor font</legend>
            <div className="settings-field settings-field-stacked">
              <span className="settings-field-label">Family</span>
              <Suspense fallback={<span role="status">Loading font picker…</span>}>
                <FontPicker
                  value={editorFontSettings.family}
                  fonts={fontCatalog.fonts}
                  previewText={fontCatalog.previewText}
                  loading={fontsLoading}
                  onChange={updateEditorFontFamily}
                />
              </Suspense>
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

function sessionStillMatches(
  current: DocumentSession,
  snapshot: DocumentSession,
): boolean {
  return (
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

function themeOptionLabel(theme: (typeof BUILT_IN_THEMES)[number]): string {
  return `${theme.label} (${theme.family}, ${theme.scheme})`;
}

function isEditorFontSize(value: unknown): value is EditorFontSize {
  return value === "small" || value === "medium" || value === "large";
}

function isOpenMode(value: unknown): value is OpenMode {
  return value === "tabs" || value === "windows";
}
