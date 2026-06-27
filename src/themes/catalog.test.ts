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
    expect(listThemesByScheme("light").every((theme) => theme.scheme === "light")).toBe(
      true,
    );
    expect(listThemesByScheme("dark").every((theme) => theme.scheme === "dark")).toBe(
      true,
    );
  });

  it("identifies built-in theme ids from persisted settings data", () => {
    expect(isThemeId("galley-light")).toBe(true);
    expect(isThemeId("missing-theme")).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId({ id: "galley-light" })).toBe(false);
  });

  it("keeps reviewed light theme text-bearing tokens readable", () => {
    const pairs = [
      ["tokyo-night-day", "editor.link", "editor.bg"],
      ["tokyo-night-day", "app.errorText", "app.errorBg"],
      ["nord-light", "editor.link", "editor.bg"],
      ["solarized-light", "editor.link", "editor.bg"],
    ] as const;

    for (const [themeId, foregroundPath, backgroundPath] of pairs) {
      const theme = getTheme(themeId);

      expect(theme, themeId).toBeDefined();
      expect(
        contrastRatio(
          colorAtPath(theme!, foregroundPath),
          colorAtPath(theme!, backgroundPath),
        ),
        `${themeId} ${foregroundPath} on ${backgroundPath}`,
      ).toBeGreaterThanOrEqual(MINIMUM_NORMAL_TEXT_CONTRAST);
    }
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

function colorAtPath(
  theme: NonNullable<ReturnType<typeof getTheme>>,
  path: "app.errorBg" | "app.errorText" | "editor.bg" | "editor.link",
): string {
  if (path === "app.errorBg") {
    return theme.tokens.app.errorBg;
  }

  if (path === "app.errorText") {
    return theme.tokens.app.errorText;
  }

  if (path === "editor.bg") {
    return theme.tokens.editor.bg;
  }

  return theme.tokens.editor.link;
}
