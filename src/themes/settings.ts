import {
  DEFAULT_CONSTANT_THEME_ID,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  isThemeId,
} from "./catalog";
import type { ThemeId } from "./tokens";

export type ThemeMode = "constant" | "system" | "native";

export type ThemeSettings = {
  mode: ThemeMode;
  constantThemeId: ThemeId;
  lightThemeId: ThemeId;
  darkThemeId: ThemeId;
};

export const THEME_SETTINGS_STORAGE_KEY = "galley-pad.themeSettings";
export const LEGACY_APPEARANCE_THEME_STORAGE_KEY = "galley-pad.appearanceTheme";
export const LEGACY_EDITOR_THEME_STORAGE_KEY = "galley-pad.editorTheme";

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  mode: "system",
  constantThemeId: DEFAULT_CONSTANT_THEME_ID,
  lightThemeId: DEFAULT_LIGHT_THEME_ID,
  darkThemeId: DEFAULT_DARK_THEME_ID,
};

export function loadThemeSettings(
  storage: Storage | null = getStorage(),
): ThemeSettings {
  if (!storage) {
    return DEFAULT_THEME_SETTINGS;
  }

  const persisted = parseThemeSettings(storage.getItem(THEME_SETTINGS_STORAGE_KEY));
  if (persisted) {
    return persisted;
  }

  return migrateLegacyThemeSettings(storage);
}

export function saveThemeSettings(
  settings: ThemeSettings,
  storage: Storage | null = getStorage(),
): void {
  if (!storage) {
    return;
  }

  storage.setItem(THEME_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function parseThemeSettings(value: unknown): ThemeSettings | null {
  const parsed = typeof value === "string" ? parseJson(value) : value;

  if (!isThemeSettingsRecord(parsed)) {
    return null;
  }

  const { mode, constantThemeId, lightThemeId, darkThemeId } = parsed;
  if (
    !isThemeMode(mode) ||
    !isThemeId(constantThemeId) ||
    !isThemeId(lightThemeId) ||
    !isThemeId(darkThemeId)
  ) {
    return null;
  }

  return { mode, constantThemeId, lightThemeId, darkThemeId };
}

export function migrateLegacyThemeSettings(
  storage: Storage | null,
): ThemeSettings {
  if (!storage) {
    return DEFAULT_THEME_SETTINGS;
  }

  const appearanceTheme = storage.getItem(LEGACY_APPEARANCE_THEME_STORAGE_KEY);
  if (appearanceTheme === "system") {
    return DEFAULT_THEME_SETTINGS;
  }
  if (appearanceTheme === "galley-light" || appearanceTheme === "galley-dark") {
    return {
      ...DEFAULT_THEME_SETTINGS,
      mode: "constant",
      constantThemeId: appearanceTheme,
    };
  }

  switch (storage.getItem(LEGACY_EDITOR_THEME_STORAGE_KEY)) {
    case "light":
      return {
        ...DEFAULT_THEME_SETTINGS,
        mode: "constant",
        constantThemeId: DEFAULT_LIGHT_THEME_ID,
      };
    case "dark":
      return {
        ...DEFAULT_THEME_SETTINGS,
        mode: "constant",
        constantThemeId: DEFAULT_DARK_THEME_ID,
      };
    default:
      return DEFAULT_THEME_SETTINGS;
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isThemeSettingsRecord(value: unknown): value is Record<keyof ThemeSettings, unknown> {
  return value !== null && typeof value === "object";
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "constant" || value === "system" || value === "native";
}

function getStorage(): Storage | null {
  return typeof globalThis.localStorage === "undefined"
    ? null
    : globalThis.localStorage;
}
