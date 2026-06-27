import {
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  getTheme,
} from "./catalog";
import type { ThemeSettings } from "./settings";
import type { ThemeDefinition, ThemeId, ThemeScheme } from "./tokens";

export function resolveTheme(
  settings: ThemeSettings,
  systemScheme: ThemeScheme,
): ThemeDefinition {
  if (settings.mode === "constant") {
    return themeOrDefault(settings.constantThemeId, systemScheme);
  }

  return themeOrDefault(
    systemScheme === "dark" ? settings.darkThemeId : settings.lightThemeId,
    systemScheme,
  );
}

function themeOrDefault(themeId: ThemeId, fallbackScheme: ThemeScheme): ThemeDefinition {
  const theme =
    getTheme(themeId) ??
    getTheme(fallbackScheme === "dark" ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID);

  if (!theme) {
    throw new Error(`Default ${fallbackScheme} theme is missing from the catalog.`);
  }

  return theme;
}
