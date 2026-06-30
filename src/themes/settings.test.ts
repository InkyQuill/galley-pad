import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_SETTINGS,
  LEGACY_APPEARANCE_THEME_STORAGE_KEY,
  LEGACY_EDITOR_THEME_STORAGE_KEY,
  THEME_SETTINGS_STORAGE_KEY,
  loadThemeSettings,
  migrateLegacyThemeSettings,
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

  it("falls back to defaults when localStorage access throws", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage is unavailable");
      },
    });

    try {
      expect(loadThemeSettings()).toEqual(DEFAULT_THEME_SETTINGS);
      expect(() => saveThemeSettings(DEFAULT_THEME_SETTINGS)).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, "localStorage", descriptor!);
    }
  });

  it("migrates legacy explicit appearance theme values", () => {
    localStorage.setItem(LEGACY_APPEARANCE_THEME_STORAGE_KEY, "galley-dark");

    const migrated = {
      ...DEFAULT_THEME_SETTINGS,
      mode: "constant",
      constantThemeId: "galley-dark",
    };

    expect(loadThemeSettings()).toEqual(migrated);
    expect(JSON.parse(localStorage.getItem(THEME_SETTINGS_STORAGE_KEY)!)).toEqual(
      migrated,
    );
  });

  it("migrates legacy system appearance theme values to Galley defaults", () => {
    localStorage.setItem(LEGACY_APPEARANCE_THEME_STORAGE_KEY, "system");

    expect(loadThemeSettings()).toEqual(DEFAULT_THEME_SETTINGS);
    expect(JSON.parse(localStorage.getItem(THEME_SETTINGS_STORAGE_KEY)!)).toEqual(
      DEFAULT_THEME_SETTINGS,
    );
  });

  it("migrates legacy dark editor theme values to a constant dark theme", () => {
    localStorage.setItem(LEGACY_EDITOR_THEME_STORAGE_KEY, "dark");

    const migrated = {
      ...DEFAULT_THEME_SETTINGS,
      mode: "constant",
      constantThemeId: "galley-dark",
    };

    expect(loadThemeSettings()).toEqual(migrated);
    expect(JSON.parse(localStorage.getItem(THEME_SETTINGS_STORAGE_KEY)!)).toEqual(
      migrated,
    );
  });

  it("migrates missing legacy storage to Galley defaults", () => {
    expect(migrateLegacyThemeSettings(null)).toEqual(DEFAULT_THEME_SETTINGS);
  });

  it("ignores unknown legacy appearance theme values without editor legacy values", () => {
    localStorage.setItem(LEGACY_APPEARANCE_THEME_STORAGE_KEY, "gruvbox-dark");

    expect(migrateLegacyThemeSettings(localStorage)).toEqual(DEFAULT_THEME_SETTINGS);
  });

  it("falls through unknown legacy appearance theme values to editor legacy values", () => {
    localStorage.setItem(LEGACY_APPEARANCE_THEME_STORAGE_KEY, "gruvbox-dark");
    localStorage.setItem(LEGACY_EDITOR_THEME_STORAGE_KEY, "dark");

    expect(migrateLegacyThemeSettings(localStorage)).toEqual({
      ...DEFAULT_THEME_SETTINGS,
      mode: "constant",
      constantThemeId: "galley-dark",
    });
  });

  it("rejects invalid persisted theme ids", () => {
    const invalidSettings = JSON.stringify({
      ...DEFAULT_THEME_SETTINGS,
      darkThemeId: "missing-theme",
    });

    expect(parseThemeSettings(invalidSettings)).toBeNull();

    localStorage.setItem(THEME_SETTINGS_STORAGE_KEY, invalidSettings);

    expect(loadThemeSettings()).toEqual(DEFAULT_THEME_SETTINGS);
    expect(JSON.parse(localStorage.getItem(THEME_SETTINGS_STORAGE_KEY)!)).toEqual(
      DEFAULT_THEME_SETTINGS,
    );
    expect(parseThemeSettings(localStorage.getItem(THEME_SETTINGS_STORAGE_KEY))).toEqual(
      DEFAULT_THEME_SETTINGS,
    );
  });
});
