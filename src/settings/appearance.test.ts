import { beforeEach, describe, expect, it } from "vitest";
import {
  APPEARANCE_THEME_STORAGE_KEY,
  EDITOR_FONT_FAMILY_STORAGE_KEY,
  EDITOR_FONT_SIZE_STORAGE_KEY,
  LEGACY_EDITOR_THEME_STORAGE_KEY,
  editorFontStyle,
  getAppearanceTheme,
  loadAppearanceThemeId,
  loadEditorFontSettings,
  saveAppearanceThemeId,
  saveEditorFontSettings,
} from "./appearance";

describe("appearance settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to the system theme", () => {
    expect(loadAppearanceThemeId()).toBe("system");
    expect(getAppearanceTheme(loadAppearanceThemeId())).toMatchObject({
      editorScheme: "auto",
      appClassName: "theme-system",
    });
  });

  it("saves and loads an explicit theme preference", () => {
    saveAppearanceThemeId("galley-dark");

    expect(localStorage.getItem(APPEARANCE_THEME_STORAGE_KEY)).toBe(
      "galley-dark",
    );
    expect(loadAppearanceThemeId()).toBe("galley-dark");
  });

  it("loads legacy light and dark editor theme preferences", () => {
    localStorage.setItem(LEGACY_EDITOR_THEME_STORAGE_KEY, "dark");
    expect(loadAppearanceThemeId()).toBe("galley-dark");

    localStorage.setItem(LEGACY_EDITOR_THEME_STORAGE_KEY, "light");
    expect(loadAppearanceThemeId()).toBe("galley-light");
  });

  it("ignores invalid stored theme values", () => {
    localStorage.setItem(APPEARANCE_THEME_STORAGE_KEY, "sepia");

    expect(loadAppearanceThemeId()).toBe("system");
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
});
