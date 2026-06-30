import { beforeEach, describe, expect, it } from "vitest";
import {
  EDITOR_FONT_FAMILY_STORAGE_KEY,
  EDITOR_FONT_SIZE_STORAGE_KEY,
  editorFontStyle,
  loadAppearanceThemeId,
  loadEditorFontSettings,
  saveAppearanceThemeId,
  saveEditorFontSettings,
} from "./appearance";
import {
  DEFAULT_THEME_SETTINGS,
  LEGACY_APPEARANCE_THEME_STORAGE_KEY,
  loadThemeSettings,
  saveThemeSettings,
} from "../themes/settings";

describe("appearance settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves, loads, and resolves editor font settings", () => {
    saveEditorFontSettings({ family: "Fira Code", size: "large" });

    expect(localStorage.getItem(EDITOR_FONT_FAMILY_STORAGE_KEY)).toBe("Fira Code");
    expect(localStorage.getItem(EDITOR_FONT_SIZE_STORAGE_KEY)).toBe("large");
    expect(loadEditorFontSettings()).toEqual({
      family: "Fira Code",
      size: "large",
    });
    expect(editorFontStyle(loadEditorFontSettings())).toMatchObject({
      fontFamily: expect.stringContaining('"Fira Code"'),
      fontSize: "1.125rem",
    });
  });

  it("ignores invalid stored editor font settings", () => {
    localStorage.setItem(EDITOR_FONT_FAMILY_STORAGE_KEY, "");
    localStorage.setItem(EDITOR_FONT_SIZE_STORAGE_KEY, "huge");

    expect(loadEditorFontSettings()).toEqual({
      family: "system",
      size: "medium",
    });
  });

  it("falls back to defaults when localStorage access throws", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage is unavailable");
      },
    });

    try {
      expect(loadEditorFontSettings()).toEqual({
        family: "system",
        size: "medium",
      });
      expect(loadAppearanceThemeId()).toBe("system");
      expect(() =>
        saveEditorFontSettings({ family: "Fira Code", size: "large" }),
      ).not.toThrow();
      expect(() => saveAppearanceThemeId("galley-dark")).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, "localStorage", descriptor!);
    }
  });

  it("projects non-Galley constant themes to the legacy Galley theme ids", () => {
    saveThemeSettings({
      ...DEFAULT_THEME_SETTINGS,
      mode: "constant",
      constantThemeId: "gruvbox-dark",
    });
    expect(loadAppearanceThemeId()).toBe("galley-dark");

    saveThemeSettings({
      ...DEFAULT_THEME_SETTINGS,
      mode: "constant",
      constantThemeId: "catppuccin-latte",
    });
    expect(loadAppearanceThemeId()).toBe("galley-light");
  });

  it("preserves custom light and dark theme selections when saving system mode", () => {
    saveThemeSettings({
      mode: "native",
      constantThemeId: "gruvbox-dark",
      lightThemeId: "catppuccin-latte",
      darkThemeId: "tokyo-night",
    });

    saveAppearanceThemeId("system");

    expect(localStorage.getItem(LEGACY_APPEARANCE_THEME_STORAGE_KEY)).toBe("system");
    expect(loadThemeSettings()).toEqual({
      mode: "system",
      constantThemeId: "gruvbox-dark",
      lightThemeId: "catppuccin-latte",
      darkThemeId: "tokyo-night",
    });
  });

  it("preserves custom light and dark theme selections when saving Galley constant mode", () => {
    saveThemeSettings({
      mode: "native",
      constantThemeId: "gruvbox-dark",
      lightThemeId: "catppuccin-latte",
      darkThemeId: "tokyo-night",
    });

    saveAppearanceThemeId("galley-dark");

    expect(localStorage.getItem(LEGACY_APPEARANCE_THEME_STORAGE_KEY)).toBe(
      "galley-dark",
    );
    expect(loadThemeSettings()).toEqual({
      mode: "constant",
      constantThemeId: "galley-dark",
      lightThemeId: "catppuccin-latte",
      darkThemeId: "tokyo-night",
    });
  });
});
