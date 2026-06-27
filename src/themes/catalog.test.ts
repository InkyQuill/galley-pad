import { describe, expect, it } from "vitest";
import {
  BUILT_IN_THEMES,
  DEFAULT_CONSTANT_THEME_ID,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  getTheme,
  isThemeId,
  listThemesByScheme,
} from "./catalog";

const MINIMUM_NORMAL_TEXT_CONTRAST = 4.5;

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = hexChannels(color).map((channel) => {
    const normalized = channel / 255;

    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function hexChannels(color: string): [number, number, number] {
  const hex = color.replace("#", "");

  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

describe("theme catalog", () => {
  it("ships the approved built-in themes", () => {
    expect(BUILT_IN_THEMES.map((theme) => theme.id)).toEqual([
      "galley-light",
      "galley-dark",
      "gruvbox-light",
      "gruvbox-dark",
      "catppuccin-latte",
      "catppuccin-mocha",
      "tokyo-night-day",
      "tokyo-night",
      "nord-light",
      "nord-dark",
      "darcula",
      "solarized-light",
      "solarized-dark",
    ]);
  });

  it("keeps default theme ids valid", () => {
    expect(getTheme(DEFAULT_CONSTANT_THEME_ID)?.id).toBe("galley-light");
    expect(getTheme(DEFAULT_LIGHT_THEME_ID)?.scheme).toBe("light");
    expect(getTheme(DEFAULT_DARK_THEME_ID)?.scheme).toBe("dark");
  });

  it("filters themes by scheme", () => {
    expect(listThemesByScheme("light").map((theme) => theme.id)).toEqual([
      "galley-light",
      "gruvbox-light",
      "catppuccin-latte",
      "tokyo-night-day",
      "nord-light",
      "solarized-light",
    ]);
    expect(listThemesByScheme("dark").map((theme) => theme.id)).toEqual([
      "galley-dark",
      "gruvbox-dark",
      "catppuccin-mocha",
      "tokyo-night",
      "nord-dark",
      "darcula",
      "solarized-dark",
    ]);
  });

  it("identifies built-in theme ids from persisted settings data", () => {
    expect(isThemeId("galley-light")).toBe(true);
    expect(isThemeId("missing-theme")).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId({ id: "galley-light" })).toBe(false);
  });

  it("keeps light theme text-bearing tokens readable", () => {
    for (const theme of listThemesByScheme("light")) {
      expect(
        contrastRatio(
          theme.tokens.editor.link,
          theme.tokens.editor.bg,
        ),
        `${theme.id} editor.link on editor.bg`,
      ).toBeGreaterThanOrEqual(MINIMUM_NORMAL_TEXT_CONTRAST);
      expect(
        contrastRatio(
          theme.tokens.app.errorText,
          theme.tokens.app.errorBg,
        ),
        `${theme.id} app.errorText on app.errorBg`,
      ).toBeGreaterThanOrEqual(MINIMUM_NORMAL_TEXT_CONTRAST);
    }
  });

  it("prevents runtime mutation of the built-in catalog", () => {
    const originalLength = BUILT_IN_THEMES.length;

    expect(() => {
      (BUILT_IN_THEMES as unknown[]).push(BUILT_IN_THEMES[0]);
    }).toThrow(TypeError);
    expect(BUILT_IN_THEMES).toHaveLength(originalLength);
  });

  it("prevents runtime mutation of built-in theme tokens", () => {
    const theme = getTheme("galley-light");

    expect(theme).toBeDefined();
    expect(() => {
      (theme!.tokens.editor as { link: string }).link = "#000000";
    }).toThrow(TypeError);
    expect(getTheme("galley-light")!.tokens.editor.link).toBe("#2f6388");
  });

  it("keeps reviewed light theme action tokens aligned", () => {
    for (const themeId of ["tokyo-night-day", "nord-light", "solarized-light"]) {
      const theme = getTheme(themeId);

      expect(theme, themeId).toBeDefined();
      expect(theme!.tokens.app.focus).toBe(theme!.tokens.editor.link);
      expect(theme!.tokens.editor.focusRing).toBe(theme!.tokens.editor.link);
      expect(theme!.tokens.markdown.checkboxAccent).toBe(theme!.tokens.editor.link);
    }
  });

  it("defines complete tokens for every theme", () => {
    for (const theme of BUILT_IN_THEMES) {
      expect(theme.tokens.app.bg).toMatch(/^#|^rgb|^color-mix/);
      expect(theme.tokens.editor.text).toBeTruthy();
      expect(theme.tokens.markdown.codeBg).toBeTruthy();
      expect(theme.tokens.syntax.keyword).toBeTruthy();
      expect(theme.tokens.syntax.punctuation).toBeTruthy();
    }
  });
});
