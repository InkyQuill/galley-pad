import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_SETTINGS } from "./settings";
import { resolveTheme } from "./resolve";

describe("resolveTheme", () => {
  it("uses the constant theme id regardless of system scheme", () => {
    const settings = {
      ...DEFAULT_THEME_SETTINGS,
      mode: "constant",
      constantThemeId: "gruvbox-dark",
      lightThemeId: "galley-light",
      darkThemeId: "galley-dark",
    } as const;

    expect(resolveTheme(settings, "light").id).toBe("gruvbox-dark");
    expect(resolveTheme(settings, "dark").id).toBe("gruvbox-dark");
  });

  it("uses the constant default when a constant theme id is invalid", () => {
    const settings = {
      ...DEFAULT_THEME_SETTINGS,
      mode: "constant",
      constantThemeId: "missing-theme",
    } as const;

    expect(resolveTheme(settings, "light").id).toBe("galley-light");
    expect(resolveTheme(settings, "dark").id).toBe("galley-light");
  });

  it("selects configured light and dark theme ids in system mode", () => {
    const settings = {
      ...DEFAULT_THEME_SETTINGS,
      mode: "system",
      lightThemeId: "catppuccin-latte",
      darkThemeId: "tokyo-night",
    } as const;

    expect(resolveTheme(settings, "light").id).toBe("catppuccin-latte");
    expect(resolveTheme(settings, "dark").id).toBe("tokyo-night");
  });

  it("uses the system-selected light and dark theme ids in native mode for now", () => {
    const settings = {
      ...DEFAULT_THEME_SETTINGS,
      mode: "native",
      lightThemeId: "nord-light",
      darkThemeId: "darcula",
    } as const;

    expect(resolveTheme(settings, "light").id).toBe("nord-light");
    expect(resolveTheme(settings, "dark").id).toBe("darcula");
  });
});
