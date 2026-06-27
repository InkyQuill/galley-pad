import { invoke } from "@tauri-apps/api/core";
import type { AppearanceThemeId, EditorFontSettings } from "../settings/appearance";
import type { OpenMode } from "../document/workspace";

export type PersistedAppSettings = {
  appearanceTheme?: AppearanceThemeId;
  editorFontFamily?: string;
  editorFontSize?: EditorFontSettings["size"];
  openMode?: OpenMode;
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
      content: string;
      savedContent: string;
      dirty: boolean;
      lineEnding: "lf" | "crlf";
      lastKnownModifiedAt: number | null;
    };
  }>;
};

export function readAppSettings(): Promise<PersistedAppSettings | null> {
  if (!isTauriRuntime()) {
    return Promise.resolve(null);
  }

  return invoke<PersistedAppSettings | null>("read_app_settings");
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

  return invoke<PersistedSwapState | null>("read_swap_state");
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
