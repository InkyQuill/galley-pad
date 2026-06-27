import {
  LEGACY_APPEARANCE_THEME_STORAGE_KEY,
  loadThemeSettings,
  saveThemeSettings,
} from "../themes/settings";
import { getTheme } from "../themes/catalog";

export type AppearanceThemeId = "system" | "galley-light" | "galley-dark";

export type AppearanceTheme = {
  id: AppearanceThemeId;
  label: string;
  editorScheme: "auto" | "light" | "dark";
  appClassName: string;
};

export type EditorFontFamily = string;
export type EditorFontSize = "small" | "medium" | "large";

export type EditorFontSettings = {
  family: EditorFontFamily;
  size: EditorFontSize;
};

export const EDITOR_FONT_FAMILY_STORAGE_KEY = "galley-pad.editorFontFamily";
export const EDITOR_FONT_SIZE_STORAGE_KEY = "galley-pad.editorFontSize";
export const SYSTEM_EDITOR_FONT_FAMILY = "system";

export const APPEARANCE_THEMES: AppearanceTheme[] = [
  {
    id: "system",
    label: "System",
    editorScheme: "auto",
    appClassName: "theme-system",
  },
  {
    id: "galley-light",
    label: "Galley Light",
    editorScheme: "light",
    appClassName: "theme-galley-light",
  },
  {
    id: "galley-dark",
    label: "Galley Dark",
    editorScheme: "dark",
    appClassName: "theme-galley-dark",
  },
];

export const SYSTEM_EDITOR_FONT_STACK =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const SERIF_EDITOR_FONT_STACK =
  'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
export const MONO_EDITOR_FONT_STACK =
  'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace';

export const EDITOR_FONT_SIZES: Array<{
  id: EditorFontSize;
  label: string;
  cssValue: string;
}> = [
  { id: "small", label: "Small", cssValue: "0.9375rem" },
  { id: "medium", label: "Medium", cssValue: "1rem" },
  { id: "large", label: "Large", cssValue: "1.125rem" },
];

export function loadAppearanceThemeId(
  storage: Storage | null = getStorage(),
): AppearanceThemeId {
  const settings = loadThemeSettings(storage);

  if (settings.mode !== "constant") {
    return "system";
  }

  if (
    settings.constantThemeId === "galley-light" ||
    settings.constantThemeId === "galley-dark"
  ) {
    return settings.constantThemeId;
  }

  return getTheme(settings.constantThemeId)?.scheme === "dark"
    ? "galley-dark"
    : "galley-light";
}

export function saveAppearanceThemeId(
  themeId: AppearanceThemeId,
  storage: Storage | null = getStorage(),
): void {
  const currentSettings = loadThemeSettings(storage);

  if (storage) {
    storage.setItem(LEGACY_APPEARANCE_THEME_STORAGE_KEY, themeId);
  }

  saveThemeSettings(
    themeId === "system"
      ? {
          ...currentSettings,
          mode: "system",
        }
      : {
          ...currentSettings,
          mode: "constant",
          constantThemeId: themeId,
        },
    storage,
  );
}

export function getAppearanceTheme(themeId: AppearanceThemeId): AppearanceTheme {
  return (
    APPEARANCE_THEMES.find((theme) => theme.id === themeId) ??
    APPEARANCE_THEMES[0]
  );
}

export function loadEditorFontSettings(
  storage: Storage | null = getStorage(),
): EditorFontSettings {
  if (!storage) {
    return { family: SYSTEM_EDITOR_FONT_FAMILY, size: "medium" };
  }

  const family = storage.getItem(EDITOR_FONT_FAMILY_STORAGE_KEY);
  const size = storage.getItem(EDITOR_FONT_SIZE_STORAGE_KEY);

  return {
    family: isEditorFontFamily(family) ? family : SYSTEM_EDITOR_FONT_FAMILY,
    size: isEditorFontSize(size) ? size : "medium",
  };
}

export function saveEditorFontSettings(
  settings: EditorFontSettings,
  storage: Storage | null = getStorage(),
) {
  if (!storage) {
    return;
  }

  storage.setItem(EDITOR_FONT_FAMILY_STORAGE_KEY, settings.family);
  storage.setItem(EDITOR_FONT_SIZE_STORAGE_KEY, settings.size);
}

export function editorFontStyle(settings: EditorFontSettings): {
  fontFamily: string;
  fontSize: string;
} {
  return {
    fontFamily: editorFontCssValue(settings.family),
    fontSize:
      EDITOR_FONT_SIZES.find((size) => size.id === settings.size)?.cssValue ??
      EDITOR_FONT_SIZES[1].cssValue,
  };
}

export function editorFontCssValue(family: EditorFontFamily): string {
  switch (family) {
    case SYSTEM_EDITOR_FONT_FAMILY:
      return SYSTEM_EDITOR_FONT_STACK;
    case "serif":
      return SERIF_EDITOR_FONT_STACK;
    case "mono":
      return MONO_EDITOR_FONT_STACK;
    default:
      return `${quoteCssFontFamily(family)}, ${SYSTEM_EDITOR_FONT_STACK}`;
  }
}

export function quoteCssFontFamily(family: string): string {
  return `"${family.split("\\").join("\\\\").split('"').join('\\"')}"`;
}

function isEditorFontFamily(value: string | null): value is EditorFontFamily {
  return Boolean(value && value.trim().length > 0 && value.length <= 200);
}

function isEditorFontSize(value: string | null): value is EditorFontSize {
  return value === "small" || value === "medium" || value === "large";
}

function getStorage(): Storage | null {
  return typeof globalThis.localStorage === "undefined"
    ? null
    : globalThis.localStorage;
}
