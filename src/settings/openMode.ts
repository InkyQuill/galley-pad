import type { OpenMode } from "../document/workspace";

export const OPEN_MODE_STORAGE_KEY = "galley-pad.openMode";

export function loadOpenMode(storage: Storage | null = getStorage()): OpenMode {
  if (!storage) {
    return "tabs";
  }

  const value = storage.getItem(OPEN_MODE_STORAGE_KEY);

  return isOpenMode(value) ? value : "tabs";
}

export function saveOpenMode(
  openMode: OpenMode,
  storage: Storage | null = getStorage(),
) {
  if (!storage) {
    return;
  }

  storage.setItem(OPEN_MODE_STORAGE_KEY, openMode);
}

function isOpenMode(value: string | null): value is OpenMode {
  return value === "tabs" || value === "windows";
}

function getStorage(): Storage | null {
  return typeof globalThis.localStorage === "undefined"
    ? null
    : globalThis.localStorage;
}
