import { lazy, Suspense, useEffect, useState } from "react";
import type { OpenMode } from "../document/workspace";
import { EDITOR_FONT_SIZES, type EditorFontFamily, type EditorFontSettings, type EditorFontSize } from "../settings/appearance";
import { EDITOR_LINE_WIDTHS, normalizeEditorLineWidth, type EditorLineWidth } from "../settings/reading";
import { listSystemFonts, type SystemFont, type SystemFontCatalog } from "../tauri/systemFonts";
import { BUILT_IN_THEMES, listThemesByScheme } from "../themes/catalog";
import type { ThemeMode, ThemeSettings } from "../themes/settings";
import { DialogSurface } from "./DialogSurface";

const FontPicker = lazy(() => import("./FontPicker").then(
  ({ FontPicker }) => ({ default: FontPicker }),
));

type SettingsDialogProps = {
  open: boolean;
  openMode: OpenMode;
  themeSettings: ThemeSettings;
  editorLineWidth: EditorLineWidth;
  spellcheck: boolean;
  allowRemoteImages: boolean;
  checkForUpdates: boolean;
  editorFontSettings: EditorFontSettings;
  updateOpenMode: (mode: OpenMode) => void;
  updateThemeMode: (mode: ThemeMode) => void;
  updateConstantTheme: (id: string) => void;
  updateLightTheme: (id: string) => void;
  updateDarkTheme: (id: string) => void;
  updateLineWidth: (width: EditorLineWidth) => void;
  updateSpellcheck: (enabled: boolean) => void;
  updateAllowRemoteImages: (enabled: boolean) => void;
  updateCheckForUpdates: (enabled: boolean) => void;
  updateEditorFontFamily: (family: EditorFontFamily) => void;
  updateEditorFontSize: (size: EditorFontSize) => void;
  focusFallback: () => void;
  onClose: () => void;
};

export function SettingsDialog({
  open, openMode, themeSettings, editorLineWidth, spellcheck, allowRemoteImages,
  checkForUpdates, editorFontSettings, updateOpenMode, updateThemeMode,
  updateConstantTheme, updateLightTheme, updateDarkTheme, updateLineWidth,
  updateSpellcheck, updateAllowRemoteImages, updateCheckForUpdates,
  updateEditorFontFamily, updateEditorFontSize, focusFallback, onClose,
}: SettingsDialogProps) {
  const [fontCatalog, setFontCatalog] = useState<SystemFontCatalog>({
    fonts: [],
    locale: null,
    previewText: "Aa Bb Cc 0123456789 The quick brown fox",
  });
  const [fontsLoading, setFontsLoading] = useState(false);
  useEffect(() => {
    if (!open || fontCatalog.fonts.length > 0) {
      return;
    }

    let disposed = false;
    setFontsLoading(true);
    void listSystemFonts()
      .then((catalog) => {
        if (!disposed) {
          setFontCatalog(normalizeFontCatalog(catalog));
        }
      })
      .catch(() => {
        if (!disposed) {
          setFontCatalog((current) => ({
            ...current,
            previewText: localizedFontPreviewText(navigator.language),
          }));
        }
      })
      .finally(() => {
        if (!disposed) {
          setFontsLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [fontCatalog.fonts.length, open]);

  if (!open) return null;
  const lightThemes = listThemesByScheme("light");
  const darkThemes = listThemesByScheme("dark");

  return (
    <DialogSurface
      title="Settings"
      closeLabel="Close settings"
      initialFocus='input[name="open-mode"]:checked'
      focusFallback={focusFallback}
      onClose={onClose}
    >
    <fieldset>
      <legend>Open files in</legend>
      <label>
        <input
          type="radio"
          name="open-mode"
          checked={openMode === "tabs"}
          onChange={() => updateOpenMode("tabs")}
        />
        Tabs
      </label>
      <label>
        <input
          type="radio"
          name="open-mode"
          checked={openMode === "windows"}
          onChange={() => updateOpenMode("windows")}
        />
        Separate windows
      </label>
    </fieldset>
    <fieldset>
      <legend>Theme</legend>
      <label>
        <input
          type="radio"
          name="theme-mode"
          checked={themeSettings.mode === "constant"}
          onChange={() => updateThemeMode("constant")}
        />
        Constant
      </label>
      {themeSettings.mode === "constant" ? (
        <label className="settings-field">
          Theme
          <select
            aria-label="Theme"
            value={themeSettings.constantThemeId}
            onChange={(event) =>
              updateConstantTheme(event.currentTarget.value)
            }
          >
            {BUILT_IN_THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {themeOptionLabel(theme)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        <input
          type="radio"
          name="theme-mode"
          checked={themeSettings.mode === "system"}
          onChange={() => updateThemeMode("system")}
        />
        System-based
      </label>
      {themeSettings.mode === "system" ? (
        <>
          <label className="settings-field">
            Light theme
            <select
              aria-label="Light theme"
              value={themeSettings.lightThemeId}
              onChange={(event) =>
                updateLightTheme(event.currentTarget.value)
              }
            >
              {lightThemes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {themeOptionLabel(theme)}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            Dark theme
            <select
              aria-label="Dark theme"
              value={themeSettings.darkThemeId}
              onChange={(event) =>
                updateDarkTheme(event.currentTarget.value)
              }
            >
              {darkThemes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {themeOptionLabel(theme)}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      <label>
        <input
          type="radio"
          name="theme-mode"
          checked={themeSettings.mode === "native"}
          disabled
          readOnly
          aria-describedby="native-theme-help"
        />
        Native
      </label>
      <p className="settings-help" id="native-theme-help">
        Native shell colors are not available yet.
      </p>
    </fieldset>
    <fieldset>
      <legend>Reading</legend>
      <label className="settings-field">
        <span className="settings-field-label">Reading width</span>
        <select
          value={editorLineWidth}
          onChange={(event) => updateLineWidth(normalizeEditorLineWidth(Number(event.target.value)))}
        >
          {EDITOR_LINE_WIDTHS.map((width) => (
            <option key={width} value={width}>
              {width === 0 ? "Full width" : `${width} characters`}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-field">
        <input
          type="checkbox"
          checked={spellcheck}
          onChange={(event) => updateSpellcheck(event.target.checked)}
        />
        Spellcheck
      </label>
      <label className="settings-field">
        <input
          type="checkbox"
          checked={allowRemoteImages}
          onChange={(event) => updateAllowRemoteImages(event.target.checked)}
        />
        Load remote HTTPS images
      </label>
    </fieldset>
    <fieldset>
      <legend>Editor font</legend>
      <div className="settings-field settings-field-stacked">
        <span className="settings-field-label">Family</span>
        <Suspense fallback={<span role="status">Loading font picker…</span>}>
          <FontPicker
            value={editorFontSettings.family}
            fonts={fontCatalog.fonts}
            previewText={fontCatalog.previewText}
            loading={fontsLoading}
            onChange={updateEditorFontFamily}
          />
        </Suspense>
      </div>
      <label className="settings-field">
        Size
        <select
          aria-label="Editor font size"
          value={editorFontSettings.size}
          onChange={(event) =>
            updateEditorFontSize(event.currentTarget.value as EditorFontSize)
          }
        >
          {EDITOR_FONT_SIZES.map((fontSize) => (
            <option key={fontSize.id} value={fontSize.id}>
              {fontSize.label}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
    <fieldset>
      <legend>Updates</legend>
      <label>
        <input
          type="checkbox"
          checked={checkForUpdates}
          onChange={(event) => updateCheckForUpdates(event.target.checked)}
        />
        Automatically check for updates
      </label>
    </fieldset>
    </DialogSurface>
  );
}

function normalizeFontCatalog(catalog: SystemFontCatalog): SystemFontCatalog {
  return {
    locale: catalog.locale,
    previewText:
      catalog.previewText || localizedFontPreviewText(catalog.locale ?? undefined),
    fonts: catalog.fonts.slice().sort(compareSystemFonts),
  };
}

function compareSystemFonts(left: SystemFont, right: SystemFont): number {
  return left.family.localeCompare(right.family, undefined, {
    sensitivity: "base",
  });
}

function localizedFontPreviewText(locale: string | undefined): string {
  const language = locale?.split(/[-_]/)[0]?.toLowerCase();
  if (
    language &&
    ["ru", "be", "bg", "kk", "ky", "mk", "mn", "sr", "tg", "uk"].includes(
      language,
    )
  ) {
    return "Aa Bb Cc Аа Бб Вв 0123456789 Съешь ещё этих мягких булок";
  }

  return "Aa Bb Cc 0123456789 The quick brown fox";
}


function themeOptionLabel(theme: (typeof BUILT_IN_THEMES)[number]): string {
  return `${theme.label} (${theme.family}, ${theme.scheme})`;
}
