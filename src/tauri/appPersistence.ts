import { invoke } from "@tauri-apps/api/core";
import type { TextEncoding } from "../document/session";
import type { OpenMode } from "../document/workspace";
import type { AppearanceThemeId, EditorFontSettings } from "../settings/appearance";
import type { ThemeSettings } from "../themes/settings";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type PersistedAppSettings = {
  appearanceTheme?: AppearanceThemeId | null;
  themeSettings?: ThemeSettings | null;
  editorFontFamily?: string | null;
  editorFontSize?: EditorFontSettings["size"] | null;
  openMode?: OpenMode | null;
  wordWrap?: boolean | null;
  editorLineWidth?: number | null;
  spellcheck?: boolean | null;
  allowRemoteImages?: boolean | null;
};

export type RawPersistedAppSettings = Omit<
  PersistedAppSettings,
  "appearanceTheme" | "themeSettings" | "wordWrap"
> & {
  appearanceTheme?: string | null;
  themeSettings?: ThemeSettings | JsonValue | null;
  wordWrap?: JsonValue;
};

export type PersistedSwapState = {
  version: 1;
  savedAt: number;
  activeTabId: string;
  openMode: OpenMode;
  tabs: Array<{
    id: string;
    session: {
      id: string;
      path: string | null;
      displayName: string;
      content?: string;
      savedContent?: string;
      dirty: boolean;
      lineEnding: "lf" | "crlf";
      lastKnownModifiedAt: number | null;
      fileExists?: boolean;
      encoding?: TextEncoding;
      savedDiskContent?: string;
    };
  }>;
};

export function readAppSettings(): Promise<RawPersistedAppSettings | null> {
  if (!isTauriRuntime()) {
    return Promise.resolve(null);
  }

  return invoke<RawPersistedAppSettings | null>("read_app_settings");
}

export function writeAppSettings(settings: PersistedAppSettings): Promise<void> {
  if (!isTauriRuntime()) {
    return Promise.resolve();
  }

  return invoke("write_app_settings", { settings });
}

export function readSwapState(): Promise<PersistedSwapState | null> {
  if (!isTauriRuntime()) {
    return Promise.resolve(null);
  }

  return invoke<unknown>("read_swap_state").then((state) => {
    if (state === null) {
      return null;
    }

    return isPersistedSwapState(state) ? state : null;
  });
}

export function writeSwapState(state: PersistedSwapState): Promise<void> {
  if (!isTauriRuntime()) {
    return Promise.resolve();
  }

  return invoke("write_swap_state", { state });
}

export function clearSwapState(): Promise<void> {
  if (!isTauriRuntime()) {
    return Promise.resolve();
  }

  return invoke("clear_swap_state");
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in globalThis;
}

function isPersistedSwapState(value: unknown): value is PersistedSwapState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = value as PersistedSwapState;
  return (
    state.version === 1 &&
    typeof state.savedAt === "number" &&
    typeof state.activeTabId === "string" &&
    isOpenMode(state.openMode) &&
    Array.isArray(state.tabs) &&
    state.tabs.every(isPersistedSwapTab)
  );
}

function isPersistedSwapTab(
  value: unknown,
): value is PersistedSwapState["tabs"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const tab = value as PersistedSwapState["tabs"][number];
  return typeof tab.id === "string" && isPersistedSession(tab.session);
}

function isPersistedSession(
  value: unknown,
): value is PersistedSwapState["tabs"][number]["session"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as PersistedSwapState["tabs"][number]["session"];
  return (
    typeof session.id === "string" &&
    (typeof session.path === "string" || session.path === null) &&
    typeof session.displayName === "string" &&
    typeof session.dirty === "boolean" &&
    ((typeof session.content === "string" && typeof session.savedContent === "string") ||
      (!session.dirty && session.content === undefined && session.savedContent === undefined)) &&
    (session.fileExists === undefined || typeof session.fileExists === "boolean") &&
    (session.savedDiskContent === undefined || typeof session.savedDiskContent === "string") &&
    (session.encoding === undefined || ["utf8", "utf8Bom", "utf16Le", "utf16Be", "windows1251"].includes(session.encoding)) &&
    (session.lineEnding === "lf" || session.lineEnding === "crlf") &&
    (typeof session.lastKnownModifiedAt === "number" ||
      session.lastKnownModifiedAt === null)
  );
}

function isOpenMode(value: unknown): value is OpenMode {
  return value === "tabs" || value === "windows";
}
