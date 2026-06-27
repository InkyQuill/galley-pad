import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_SETTINGS,
  LEGACY_APPEARANCE_THEME_STORAGE_KEY,
  LEGACY_EDITOR_THEME_STORAGE_KEY,
  THEME_SETTINGS_STORAGE_KEY,
  loadThemeSettings,
  parseThemeSettings,
  saveThemeSettings,
} from "./settings";

describe("theme settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to Galley system theme settings", () => {
    expect(DEFAULT_THEME_SETTINGS).toEqual({
      mode: "system",
      constantThemeId: "galley-light",
      lightThemeId: "galley-light",
      darkThemeId: "galley-dark",
    });
    expect(loadThemeSettings()).toEqual(DEFAULT_THEME_SETTINGS);
  });

  it("saves and loads a full settings object", () => {
    const settings = {
      mode: "native",
      constantThemeId: "gruvbox-dark",
      lightThemeId: "catppuccin-latte",
      darkThemeId: "tokyo-night",
    } as const;

    saveThemeSettings(settings);

    expect(localStorage.getItem(THEME_SETTINGS_STORAGE_KEY)).toBe(
      JSON.stringify(settings),
    );
    expect(loadThemeSettings()).toEqual(settings);
  });

  it("migrates legacy explicit appearance theme values", () => {
    localStorage.setItem(LEGACY_APPEARANCE_THEME_STORAGE_KEY, "galley-dark");

    expect(loadThemeSettings()).toEqual({
      ...DEFAULT_THEME_SETTINGS,
      mode: "constant",
      constantThemeId: "galley-dark",
    });
  });

  it("migrates legacy system appearance theme values to Galley defaults", () => {
    localStorage.setItem(LEGACY_APPEARANCE_THEME_STORAGE_KEY, "system");

    expect(loadThemeSettings()).toEqual(DEFAULT_THEME_SETTINGS);
  });

  it("migrates legacy dark editor theme values to a constant dark theme", () => {
    localStorage.setItem(LEGACY_EDITOR_THEME_STORAGE_KEY, "dark");

    expect(loadThemeSettings()).toEqual({
      ...DEFAULT_THEME_SETTINGS,
      mode: "constant",
      constantThemeId: "galley-dark",
    });
  });

  it("rejects invalid persisted theme ids", () => {
    localStorage.setItem(
      THEME_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_THEME_SETTINGS,
        darkThemeId: "missing-theme",
      }),
    );

    expect(loadThemeSettings()).toEqual(DEFAULT_THEME_SETTINGS);
    expect(parseThemeSettings(localStorage.getItem(THEME_SETTINGS_STORAGE_KEY))).toBeNull();
  });
});
