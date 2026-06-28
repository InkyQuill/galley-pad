# Theme Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a typed built-in theme engine for Galley Pad with constant/system-based theme selection, app/editor CSS variable propagation, and Lucide close icons.

**Architecture:** Galley Pad owns theme definitions in `src/themes/` and applies the resolved theme as CSS variables on `.app-shell`. Galley Editor remains theme-name agnostic and receives only inherited `--ge-*` variables plus the existing light/dark/auto behavior hint.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind CSS v4 imports, Vitest, Testing Library, Tauri 2 persistence.

---

## File Structure

- Create `src/themes/tokens.ts`: token interfaces, theme metadata types, and CSS variable names.
- Create `src/themes/catalog.ts`: built-in theme definitions and lookup/filter helpers.
- Create `src/themes/style.ts`: converts theme tokens into React CSS variable style objects.
- Create `src/themes/resolve.ts`: resolves `ThemeSettings` plus system scheme into the active theme.
- Create `src/themes/settings.ts`: localStorage load/save and migration from old appearance settings.
- Create `src/themes/index.ts`: barrel export for app consumers.
- Create `src/themes/*.test.ts`: focused tests for catalog, style mapping, resolution, and migration.
- Modify `src/settings/appearance.ts`: keep editor font helpers, remove or re-export only compatibility theme helpers needed during migration.
- Modify `src/settings/appearance.test.ts`: keep font tests or move theme tests to `src/themes/settings.test.ts`.
- Modify `src/tauri/appPersistence.ts`: store/read new `themeSettings` while accepting old `appearanceTheme`.
- Modify `src-tauri/src/lib.rs`: add `theme_settings` field to `PersistedAppSettings`.
- Modify `src/App.tsx`: use `ThemeSettings`, system scheme listener, theme CSS variables, settings UI, and Lucide `X` icons.
- Modify `src/App.test.tsx`: update settings, persistence, system switch, and close icon tests.
- Modify `src/components/DocumentView.tsx`: accept the resolved editor scheme behavior without theme names.
- Modify `src/components/DocumentView.test.tsx`: assert editor scheme and variable inheritance behavior.
- Modify `src/styles.css`: remove hard-coded theme value blocks and keep selectors consuming `--app-*` and `--ge-*`.
- Modify `src/test/galley-editor.mock.tsx`: keep the current surface style passthrough available for assertions.

---

### Task 1: Add Theme Token Types And CSS Variable Mapping

**Files:**
- Create: `src/themes/tokens.ts`
- Create: `src/themes/style.ts`
- Create: `src/themes/style.test.ts`
- Create: `src/themes/index.ts`

- [ ] **Step 1: Write failing style mapping tests**

Create `src/themes/style.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ThemeDefinition } from "./tokens";
import { themeToCssVariables } from "./style";

const testTheme: ThemeDefinition = {
  id: "test-light",
  label: "Test Light",
  family: "Test",
  scheme: "light",
  tokens: {
    app: {
      bg: "#ffffff",
      text: "#111111",
      panel: "#f8f8f8",
      panelMuted: "#eeeeee",
      border: "#dddddd",
      textMuted: "#666666",
      tabText: "#555555",
      hover: "#e8e8e8",
      focus: "#3366ff",
      errorBg: "#fff0f0",
      errorBorder: "#ffaaaa",
      errorText: "#771111",
      dialogShadow: "0 18px 54px rgb(0 0 0 / 18%)",
      backdrop: "rgb(0 0 0 / 24%)",
    },
    editor: {
      text: "#202020",
      textMuted: "#707070",
      bg: "#ffffff",
      surface: "#f7f7f7",
      surfaceElevated: "#fafafa",
      border: "#dddddd",
      link: "#0055aa",
      linkHover: "#003f80",
      selection: "rgb(0 85 170 / 24%)",
      caret: "currentColor",
      focusRing: "#3366ff",
      scrollbarThumb: "rgb(0 0 0 / 28%)",
      scrollbarThumbHover: "rgb(0 0 0 / 42%)",
    },
    markdown: {
      codeFg: "#202020",
      codeBg: "rgb(0 0 0 / 8%)",
      codeFenceBg: "rgb(0 0 0 / 6%)",
      codeHeaderBg: "rgb(0 0 0 / 8%)",
      blockquoteBorder: "rgb(0 0 0 / 28%)",
      blockquoteFg: "#555555",
      divider: "rgb(0 0 0 / 24%)",
      tableBorder: "rgb(0 0 0 / 24%)",
      checkboxAccent: "#0055aa",
    },
    syntax: {
      keyword: "#7a3db8",
      string: "#237a57",
      number: "#9a5d28",
      comment: "#777777",
      variable: "#1f4f99",
      type: "#7a4f00",
      function: "#005f87",
      operator: "#555555",
      punctuation: "#555555",
    },
  },
};

describe("themeToCssVariables", () => {
  it("maps app, editor, markdown, and syntax tokens to CSS variables", () => {
    expect(themeToCssVariables(testTheme)).toMatchObject({
      colorScheme: "light",
      "--app-bg": "#ffffff",
      "--app-text": "#111111",
      "--app-panel": "#f8f8f8",
      "--ge-color-text": "#202020",
      "--ge-color-bg": "#ffffff",
      "--ge-color-code-bg": "rgb(0 0 0 / 8%)",
      "--ge-color-token-keyword": "#7a3db8",
      "--ge-color-token-comment": "#777777",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- src/themes/style.test.ts
```

Expected: FAIL because `src/themes/style.ts` does not exist.

- [ ] **Step 3: Implement token types**

Create `src/themes/tokens.ts`:

```ts
export type ThemeId = string;
export type ThemeScheme = "light" | "dark";

export type ThemeTokens = {
  app: {
    bg: string;
    text: string;
    panel: string;
    panelMuted: string;
    border: string;
    textMuted: string;
    tabText: string;
    hover: string;
    focus: string;
    errorBg: string;
    errorBorder: string;
    errorText: string;
    dialogShadow: string;
    backdrop: string;
  };
  editor: {
    text: string;
    textMuted: string;
    bg: string;
    surface: string;
    surfaceElevated: string;
    border: string;
    link: string;
    linkHover: string;
    selection: string;
    caret: string;
    focusRing: string;
    scrollbarThumb: string;
    scrollbarThumbHover: string;
  };
  markdown: {
    codeFg: string;
    codeBg: string;
    codeFenceBg: string;
    codeHeaderBg: string;
    blockquoteBorder: string;
    blockquoteFg: string;
    divider: string;
    tableBorder: string;
    checkboxAccent: string;
  };
  syntax: {
    keyword: string;
    string: string;
    number: string;
    comment: string;
    variable: string;
    type: string;
    function: string;
    operator: string;
    punctuation: string;
  };
};

export type ThemeDefinition = {
  id: ThemeId;
  label: string;
  family: string;
  scheme: ThemeScheme;
  tokens: ThemeTokens;
};

export type ThemeCssVariables = React.CSSProperties & Record<`--${string}`, string>;
```

- [ ] **Step 4: Implement CSS variable mapping**

Create `src/themes/style.ts`:

```ts
import type { ThemeCssVariables, ThemeDefinition } from "./tokens";

export function themeToCssVariables(theme: ThemeDefinition): ThemeCssVariables {
  const { app, editor, markdown, syntax } = theme.tokens;

  return {
    colorScheme: theme.scheme,
    "--app-bg": app.bg,
    "--app-text": app.text,
    "--app-panel": app.panel,
    "--app-panel-muted": app.panelMuted,
    "--app-border": app.border,
    "--app-text-muted": app.textMuted,
    "--app-tab-text": app.tabText,
    "--app-hover": app.hover,
    "--app-focus": app.focus,
    "--app-error-bg": app.errorBg,
    "--app-error-border": app.errorBorder,
    "--app-error-text": app.errorText,
    "--app-dialog-shadow": app.dialogShadow,
    "--app-backdrop": app.backdrop,
    "--ge-color-text": editor.text,
    "--ge-color-text-muted": editor.textMuted,
    "--ge-color-bg": editor.bg,
    "--ge-color-surface": editor.surface,
    "--ge-color-surface-elevated": editor.surfaceElevated,
    "--ge-color-border": editor.border,
    "--ge-color-link": editor.link,
    "--ge-color-link-hover": editor.linkHover,
    "--ge-color-selection": editor.selection,
    "--ge-color-caret": editor.caret,
    "--ge-color-focus-ring": editor.focusRing,
    "--ge-color-scrollbar-thumb": editor.scrollbarThumb,
    "--ge-color-scrollbar-thumb-hover": editor.scrollbarThumbHover,
    "--ge-color-code-fg": markdown.codeFg,
    "--ge-color-code-bg": markdown.codeBg,
    "--ge-color-code-fence-bg": markdown.codeFenceBg,
    "--ge-color-code-header-bg": markdown.codeHeaderBg,
    "--ge-color-blockquote-border": markdown.blockquoteBorder,
    "--ge-color-blockquote-fg": markdown.blockquoteFg,
    "--ge-color-divider": markdown.divider,
    "--ge-color-table-border": markdown.tableBorder,
    "--ge-color-checkbox-accent": markdown.checkboxAccent,
    "--ge-color-token-keyword": syntax.keyword,
    "--ge-color-token-string": syntax.string,
    "--ge-color-token-number": syntax.number,
    "--ge-color-token-comment": syntax.comment,
    "--ge-color-token-variable": syntax.variable,
    "--ge-color-token-type": syntax.type,
    "--ge-color-token-function": syntax.function,
    "--ge-color-token-operator": syntax.operator,
    "--ge-color-token-punctuation": syntax.punctuation,
    "--ge-shadow-editor": "none",
  };
}
```

Create `src/themes/index.ts`:

```ts
export * from "./catalog";
export * from "./resolve";
export * from "./settings";
export * from "./style";
export * from "./tokens";
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm run test:unit -- src/themes/style.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/themes/tokens.ts src/themes/style.ts src/themes/style.test.ts src/themes/index.ts
git commit -m "feat(themes): add theme token mapping"
```

---

### Task 2: Add Built-In Theme Catalog

**Files:**
- Create: `src/themes/catalog.ts`
- Create: `src/themes/catalog.test.ts`

- [ ] **Step 1: Write failing catalog tests**

Create `src/themes/catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_THEMES,
  DEFAULT_CONSTANT_THEME_ID,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  getTheme,
  listThemesByScheme,
} from "./catalog";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- src/themes/catalog.test.ts
```

Expected: FAIL because `catalog.ts` does not exist.

- [ ] **Step 3: Implement catalog helpers and themes**

Create `src/themes/catalog.ts`. Use the current Galley Light and Galley Dark values from `src/styles.css` for `galley-light` and `galley-dark`, then add the approved popular palettes. Keep definitions as plain objects; avoid generation or network lookups.

Required export shape:

```ts
import type { ThemeDefinition, ThemeId, ThemeScheme, ThemeTokens } from "./tokens";

export const DEFAULT_CONSTANT_THEME_ID = "galley-light";
export const DEFAULT_LIGHT_THEME_ID = "galley-light";
export const DEFAULT_DARK_THEME_ID = "galley-dark";

export const BUILT_IN_THEMES: ThemeDefinition[] = [
  theme("galley-light", "Galley Light", "Galley", "light", {
    app: {
      bg: "#f6f4ef",
      text: "#1f2523",
      panel: "#fbfaf7",
      panelMuted: "#f3f0e9",
      border: "#d8d3c8",
      textMuted: "#69726e",
      tabText: "#4c5551",
      hover: "#e3ded3",
      focus: "#5d7cda",
      errorBg: "#fff1ed",
      errorBorder: "#e2b8ad",
      errorText: "#7a2317",
      dialogShadow: "0 18px 54px rgb(31 37 35 / 18%)",
      backdrop: "rgb(31 37 35 / 24%)",
    },
    editor: {
      text: "#202522",
      textMuted: "#69726e",
      bg: "#fbfaf7",
      surface: "#f3f0e9",
      surfaceElevated: "#f8f6f0",
      border: "#d8d3c8",
      link: "#2f6388",
      linkHover: "#214d6d",
      selection: "rgb(47 99 136 / 24%)",
      caret: "currentColor",
      focusRing: "#5d7cda",
      scrollbarThumb: "rgb(105 114 110 / 34%)",
      scrollbarThumbHover: "rgb(105 114 110 / 54%)",
    },
    markdown: {
      codeFg: "#202522",
      codeBg: "rgb(76 85 81 / 12%)",
      codeFenceBg: "rgb(76 85 81 / 8%)",
      codeHeaderBg: "rgb(76 85 81 / 8%)",
      blockquoteBorder: "rgb(76 85 81 / 34%)",
      blockquoteFg: "#59635f",
      divider: "rgb(76 85 81 / 28%)",
      tableBorder: "rgb(76 85 81 / 28%)",
      checkboxAccent: "#2f6388",
    },
    syntax: syntax({
      keyword: "#6f4aa8",
      string: "#39765e",
      number: "#9a5d28",
      comment: "#7a837f",
      variable: "#2f6388",
      type: "#855f28",
      function: "#2d6f73",
      operator: "#5d6662",
      punctuation: "#5d6662",
    }),
  }),
  theme("galley-dark", "Galley Dark", "Galley", "dark", galleyDarkTokens),
  theme("gruvbox-light", "Gruvbox Light", "Gruvbox", "light", gruvboxLightTokens),
  theme("gruvbox-dark", "Gruvbox Dark", "Gruvbox", "dark", gruvboxDarkTokens),
  theme("catppuccin-latte", "Catppuccin Latte", "Catppuccin", "light", catppuccinLatteTokens),
  theme("catppuccin-mocha", "Catppuccin Mocha", "Catppuccin", "dark", catppuccinMochaTokens),
  theme("tokyo-night-day", "Tokyo Night Day", "Tokyo Night", "light", tokyoNightDayTokens),
  theme("tokyo-night", "Tokyo Night", "Tokyo Night", "dark", tokyoNightTokens),
  theme("nord-light", "Nord Light", "Nord", "light", nordLightTokens),
  theme("nord-dark", "Nord Dark", "Nord", "dark", nordDarkTokens),
  theme("darcula", "Darcula", "Darcula", "dark", darculaTokens),
  theme("solarized-light", "Solarized Light", "Solarized", "light", solarizedLightTokens),
  theme("solarized-dark", "Solarized Dark", "Solarized", "dark", solarizedDarkTokens),
];

function theme(
  id: ThemeId,
  label: string,
  family: string,
  scheme: ThemeScheme,
  tokens: ThemeTokens,
): ThemeDefinition {
  return { id, label, family, scheme, tokens };
}

function syntax(tokens: ThemeTokens["syntax"]): ThemeTokens["syntax"] {
  return tokens;
}

export function getTheme(themeId: ThemeId): ThemeDefinition | undefined {
  return BUILT_IN_THEMES.find((theme) => theme.id === themeId);
}

export function listThemesByScheme(scheme: ThemeScheme): ThemeDefinition[] {
  return BUILT_IN_THEMES.filter((theme) => theme.scheme === scheme);
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && Boolean(getTheme(value));
}
```

Define the token constants referenced above in the same file. Each constant must satisfy `ThemeTokens` with all `app`, `editor`, `markdown`, and `syntax` keys populated. The catalog test in Step 1 must continue asserting the exact 13 IDs, so a partial catalog cannot pass.

- [ ] **Step 4: Run catalog tests**

Run:

```bash
npm run test:unit -- src/themes/catalog.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run style tests to ensure catalog themes map cleanly**

Run:

```bash
npm run test:unit -- src/themes/style.test.ts src/themes/catalog.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/themes/catalog.ts src/themes/catalog.test.ts
git commit -m "feat(themes): add built-in theme catalog"
```

---

### Task 3: Add Theme Settings Migration And Resolution

**Files:**
- Create: `src/themes/settings.ts`
- Create: `src/themes/settings.test.ts`
- Create: `src/themes/resolve.ts`
- Create: `src/themes/resolve.test.ts`
- Modify: `src/settings/appearance.ts`
- Modify: `src/settings/appearance.test.ts`

- [ ] **Step 1: Write failing settings migration tests**

Create `src/themes/settings.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  LEGACY_APPEARANCE_THEME_STORAGE_KEY,
  LEGACY_EDITOR_THEME_STORAGE_KEY,
  THEME_SETTINGS_STORAGE_KEY,
  loadThemeSettings,
  saveThemeSettings,
} from "./settings";

describe("theme settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to system-based Galley light and dark", () => {
    expect(loadThemeSettings()).toEqual({
      mode: "system",
      constantThemeId: "galley-light",
      lightThemeId: "galley-light",
      darkThemeId: "galley-dark",
    });
  });

  it("saves and loads complete theme settings", () => {
    saveThemeSettings({
      mode: "system",
      constantThemeId: "tokyo-night",
      lightThemeId: "catppuccin-latte",
      darkThemeId: "catppuccin-mocha",
    });

    expect(JSON.parse(localStorage.getItem(THEME_SETTINGS_STORAGE_KEY) ?? "{}")).toEqual({
      mode: "system",
      constantThemeId: "tokyo-night",
      lightThemeId: "catppuccin-latte",
      darkThemeId: "catppuccin-mocha",
    });
    expect(loadThemeSettings()).toEqual({
      mode: "system",
      constantThemeId: "tokyo-night",
      lightThemeId: "catppuccin-latte",
      darkThemeId: "catppuccin-mocha",
    });
  });

  it("migrates legacy appearance theme values", () => {
    localStorage.setItem(LEGACY_APPEARANCE_THEME_STORAGE_KEY, "galley-dark");
    expect(loadThemeSettings()).toMatchObject({
      mode: "constant",
      constantThemeId: "galley-dark",
    });

    localStorage.clear();
    localStorage.setItem(LEGACY_APPEARANCE_THEME_STORAGE_KEY, "system");
    expect(loadThemeSettings()).toMatchObject({
      mode: "system",
      lightThemeId: "galley-light",
      darkThemeId: "galley-dark",
    });
  });

  it("migrates legacy editor theme values", () => {
    localStorage.setItem(LEGACY_EDITOR_THEME_STORAGE_KEY, "dark");
    expect(loadThemeSettings()).toMatchObject({
      mode: "constant",
      constantThemeId: "galley-dark",
    });
  });

  it("rejects invalid persisted theme ids", () => {
    localStorage.setItem(
      THEME_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        mode: "constant",
        constantThemeId: "missing",
        lightThemeId: "galley-light",
        darkThemeId: "galley-dark",
      }),
    );

    expect(loadThemeSettings()).toEqual({
      mode: "system",
      constantThemeId: "galley-light",
      lightThemeId: "galley-light",
      darkThemeId: "galley-dark",
    });
  });
});
```

- [ ] **Step 2: Write failing resolution tests**

Create `src/themes/resolve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveTheme } from "./resolve";

describe("resolveTheme", () => {
  it("uses the constant theme regardless of system scheme", () => {
    expect(
      resolveTheme(
        {
          mode: "constant",
          constantThemeId: "darcula",
          lightThemeId: "galley-light",
          darkThemeId: "galley-dark",
        },
        "light",
      ).id,
    ).toBe("darcula");
  });

  it("uses light and dark selections in system mode", () => {
    const settings = {
      mode: "system" as const,
      constantThemeId: "galley-light",
      lightThemeId: "solarized-light",
      darkThemeId: "tokyo-night",
    };

    expect(resolveTheme(settings, "light").id).toBe("solarized-light");
    expect(resolveTheme(settings, "dark").id).toBe("tokyo-night");
  });

  it("falls back to Galley defaults for native mode until native provider exists", () => {
    expect(
      resolveTheme(
        {
          mode: "native",
          constantThemeId: "darcula",
          lightThemeId: "solarized-light",
          darkThemeId: "tokyo-night",
        },
        "dark",
      ).id,
    ).toBe("tokyo-night");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- src/themes/settings.test.ts src/themes/resolve.test.ts
```

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement settings helpers**

Create `src/themes/settings.ts`:

```ts
import {
  DEFAULT_CONSTANT_THEME_ID,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  isThemeId,
} from "./catalog";
import type { ThemeId } from "./tokens";

export type ThemeMode = "constant" | "system" | "native";

export type ThemeSettings = {
  mode: ThemeMode;
  constantThemeId: ThemeId;
  lightThemeId: ThemeId;
  darkThemeId: ThemeId;
};

export const THEME_SETTINGS_STORAGE_KEY = "galley-pad.themeSettings";
export const LEGACY_APPEARANCE_THEME_STORAGE_KEY = "galley-pad.appearanceTheme";
export const LEGACY_EDITOR_THEME_STORAGE_KEY = "galley-pad.editorTheme";

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  mode: "system",
  constantThemeId: DEFAULT_CONSTANT_THEME_ID,
  lightThemeId: DEFAULT_LIGHT_THEME_ID,
  darkThemeId: DEFAULT_DARK_THEME_ID,
};

export function loadThemeSettings(storage: Storage | null = getStorage()): ThemeSettings {
  if (!storage) {
    return DEFAULT_THEME_SETTINGS;
  }

  const stored = parseThemeSettings(storage.getItem(THEME_SETTINGS_STORAGE_KEY));
  if (stored) {
    return stored;
  }

  return migrateLegacyThemeSettings(storage);
}

export function saveThemeSettings(
  settings: ThemeSettings,
  storage: Storage | null = getStorage(),
) {
  if (!storage) {
    return;
  }

  storage.setItem(THEME_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function parseThemeSettings(value: unknown): ThemeSettings | null {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const candidate = parsed as ThemeSettings;
  if (
    isThemeMode(candidate.mode) &&
    isThemeId(candidate.constantThemeId) &&
    isThemeId(candidate.lightThemeId) &&
    isThemeId(candidate.darkThemeId)
  ) {
    return candidate;
  }

  return null;
}

export function migrateLegacyThemeSettings(storage: Storage): ThemeSettings {
  const appearance = storage.getItem(LEGACY_APPEARANCE_THEME_STORAGE_KEY);
  if (appearance === "galley-light" || appearance === "galley-dark") {
    return { ...DEFAULT_THEME_SETTINGS, mode: "constant", constantThemeId: appearance };
  }
  if (appearance === "system") {
    return DEFAULT_THEME_SETTINGS;
  }

  const editor = storage.getItem(LEGACY_EDITOR_THEME_STORAGE_KEY);
  if (editor === "light") {
    return { ...DEFAULT_THEME_SETTINGS, mode: "constant", constantThemeId: "galley-light" };
  }
  if (editor === "dark") {
    return { ...DEFAULT_THEME_SETTINGS, mode: "constant", constantThemeId: "galley-dark" };
  }

  return DEFAULT_THEME_SETTINGS;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "constant" || value === "system" || value === "native";
}

function getStorage(): Storage | null {
  return typeof globalThis.localStorage === "undefined"
    ? null
    : globalThis.localStorage;
}
```

- [ ] **Step 5: Implement resolver**

Create `src/themes/resolve.ts`:

```ts
import { DEFAULT_DARK_THEME_ID, DEFAULT_LIGHT_THEME_ID, getTheme } from "./catalog";
import type { ThemeSettings } from "./settings";
import type { ThemeDefinition, ThemeScheme } from "./tokens";

export function resolveTheme(
  settings: ThemeSettings,
  systemScheme: ThemeScheme,
): ThemeDefinition {
  if (settings.mode === "constant") {
    return getTheme(settings.constantThemeId) ?? fallbackTheme(systemScheme);
  }

  const themeId =
    systemScheme === "dark" ? settings.darkThemeId : settings.lightThemeId;
  return getTheme(themeId) ?? fallbackTheme(systemScheme);
}

function fallbackTheme(systemScheme: ThemeScheme): ThemeDefinition {
  const fallbackId =
    systemScheme === "dark" ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID;
  const fallback = getTheme(fallbackId);
  if (!fallback) {
    throw new Error(`Missing default ${systemScheme} theme`);
  }
  return fallback;
}
```

- [ ] **Step 6: Move old appearance tests to theme settings tests**

Modify `src/settings/appearance.ts` so it no longer owns `AppearanceThemeId`, `APPEARANCE_THEMES`, `loadAppearanceThemeId`, `saveAppearanceThemeId`, or `getAppearanceTheme`. Keep editor font exports unchanged.

Modify `src/settings/appearance.test.ts` by removing old theme tests and imports. The file should only cover editor font settings:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  EDITOR_FONT_FAMILY_STORAGE_KEY,
  EDITOR_FONT_SIZE_STORAGE_KEY,
  editorFontStyle,
  loadEditorFontSettings,
  saveEditorFontSettings,
} from "./appearance";

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
});
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm run test:unit -- src/themes/settings.test.ts src/themes/resolve.test.ts src/settings/appearance.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/themes/settings.ts src/themes/settings.test.ts src/themes/resolve.ts src/themes/resolve.test.ts src/settings/appearance.ts src/settings/appearance.test.ts
git commit -m "feat(themes): add theme settings resolution"
```

---

### Task 4: Update App Persistence For Theme Settings

**Files:**
- Modify: `src/tauri/appPersistence.ts`
- Modify: `src/tauri/appPersistence.test.ts`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing TypeScript persistence tests**

Add to `src/tauri/appPersistence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PersistedAppSettings } from "./appPersistence";

describe("app settings persistence shape", () => {
  it("accepts new theme settings while keeping old appearanceTheme optional", () => {
    const settings: PersistedAppSettings = {
      appearanceTheme: "galley-dark",
      themeSettings: {
        mode: "system",
        constantThemeId: "galley-light",
        lightThemeId: "solarized-light",
        darkThemeId: "tokyo-night",
      },
      editorFontFamily: "Fira Code",
      editorFontSize: "large",
      openMode: "tabs",
    };

    expect(settings.themeSettings?.darkThemeId).toBe("tokyo-night");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- src/tauri/appPersistence.test.ts
```

Expected: FAIL because `themeSettings` is not part of `PersistedAppSettings`.

- [ ] **Step 3: Update TypeScript persisted settings type**

Modify `src/tauri/appPersistence.ts`:

```ts
import type { ThemeSettings } from "../themes/settings";

export type PersistedAppSettings = {
  appearanceTheme?: string;
  themeSettings?: ThemeSettings;
  editorFontFamily?: string;
  editorFontSize?: EditorFontSettings["size"];
  openMode?: OpenMode;
};
```

Keep `appearanceTheme?: string` temporarily so old settings from Rust can still be migrated in `App`.

- [ ] **Step 4: Update Rust persisted settings struct**

Modify `src-tauri/src/lib.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeSettings {
    pub mode: String,
    pub constant_theme_id: String,
    pub light_theme_id: String,
    pub dark_theme_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedAppSettings {
    pub appearance_theme: Option<String>,
    pub theme_settings: Option<ThemeSettings>,
    pub editor_font_family: Option<String>,
    pub editor_font_size: Option<String>,
    pub open_mode: Option<String>,
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test:unit -- src/tauri/appPersistence.test.ts
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS. Existing Rust warnings may remain.

- [ ] **Step 6: Commit**

```bash
git add src/tauri/appPersistence.ts src/tauri/appPersistence.test.ts src-tauri/src/lib.rs
git commit -m "feat(themes): persist theme settings"
```

---

### Task 5: Integrate Theme Resolution Into App

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/DocumentView.tsx`
- Modify: `src/components/DocumentView.test.tsx`

- [ ] **Step 1: Write failing App tests for persisted theme settings and system scheme**

Add to `src/App.test.tsx`:

```ts
it("applies persisted theme settings to the app shell and editor", async () => {
  readAppSettingsMock.mockResolvedValue({
    themeSettings: {
      mode: "constant",
      constantThemeId: "tokyo-night",
      lightThemeId: "galley-light",
      darkThemeId: "galley-dark",
    },
  });

  render(<App />);

  await waitFor(() => {
    expect(screen.getByTestId("mock-galley-editor-shell")).toHaveAttribute(
      "data-theme",
      "dark",
    );
  });
  expect(screen.getByTestId("app-shell").style.getPropertyValue("--app-bg")).toBeTruthy();
  expect(screen.getByTestId("app-shell").style.getPropertyValue("--ge-color-bg")).toBeTruthy();
});

it("updates the resolved theme when system color scheme changes", async () => {
  const listeners: Array<(event: MediaQueryListEvent) => void> = [];
  const mediaQuery = {
    matches: false,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.push(listener);
    },
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList;
  vi.spyOn(window, "matchMedia").mockReturnValue(mediaQuery);
  readAppSettingsMock.mockResolvedValue({
    themeSettings: {
      mode: "system",
      constantThemeId: "galley-light",
      lightThemeId: "galley-light",
      darkThemeId: "galley-dark",
    },
  });

  render(<App />);

  await waitFor(() => {
    expect(screen.getByTestId("mock-galley-editor-shell")).toHaveAttribute(
      "data-theme",
      "light",
    );
  });

  act(() => {
    listeners[0]?.({ matches: true } as MediaQueryListEvent);
  });

  expect(screen.getByTestId("mock-galley-editor-shell")).toHaveAttribute(
    "data-theme",
    "dark",
  );
});
```

- [ ] **Step 2: Write failing DocumentView test for scheme-only theme input**

Modify `src/components/DocumentView.test.tsx`:

```ts
it("passes only the resolved editor scheme into Galley chrome", () => {
  render(
    <DocumentView
      content="One two"
      onContentChange={() => undefined}
      editorScheme="dark"
      fontSettings={{ family: "mono", size: "large" }}
      status="Unsaved"
    />,
  );

  expect(screen.getByTestId("mock-galley-editor-shell")).toHaveAttribute(
    "data-theme",
    "dark",
  );
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- src/App.test.tsx src/components/DocumentView.test.tsx
```

Expected: FAIL because `App` still uses `AppearanceTheme` and `DocumentView` still expects a theme object.

- [ ] **Step 4: Update DocumentView props**

Modify `src/components/DocumentView.tsx`:

```ts
export type DocumentViewProps = {
  content: string;
  onContentChange: (content: string) => void;
  panelId?: string;
  labelledBy?: string;
  toolbarVisible?: boolean;
  editorScheme?: "auto" | "light" | "dark";
  fontSettings?: EditorFontSettings;
  status?: string;
};
```

Then pass:

```tsx
theme={editorScheme ?? "auto"}
```

Remove `AppearanceTheme` imports from `DocumentView`.

- [ ] **Step 5: Add system color scheme state and theme style in App**

Modify `src/App.tsx` imports:

```ts
import { X } from "lucide-react";
import {
  DEFAULT_THEME_SETTINGS,
  loadThemeSettings,
  resolveTheme,
  saveThemeSettings,
  themeToCssVariables,
  type ThemeSettings,
} from "./themes";
```

Add state:

```ts
const [themeSettings, setThemeSettings] = useState<ThemeSettings>(() =>
  loadThemeSettings(),
);
const [systemScheme, setSystemScheme] = useState<"light" | "dark">(() =>
  getSystemScheme(),
);
const latestThemeSettings = useRef(themeSettings);
```

Add effect:

```ts
useEffect(() => {
  const query = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!query) {
    return;
  }

  const update = (event: MediaQueryListEvent | MediaQueryList) => {
    setSystemScheme(event.matches ? "dark" : "light");
  };

  update(query);
  query.addEventListener("change", update);
  return () => query.removeEventListener("change", update);
}, []);
```

Add helper outside component:

```ts
function getSystemScheme(): "light" | "dark" {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
```

Resolve theme before return:

```ts
latestThemeSettings.current = themeSettings;
const resolvedTheme = resolveTheme(themeSettings, systemScheme);
const themeStyle = themeToCssVariables(resolvedTheme);
const editorScheme =
  themeSettings.mode === "system" || themeSettings.mode === "native"
    ? "auto"
    : resolvedTheme.scheme;
```

Apply shell data test id and style:

```tsx
<div className="app-shell" data-testid="app-shell" style={themeStyle}>
```

Pass to `DocumentView`:

```tsx
editorScheme={editorScheme}
```

- [ ] **Step 6: Update app settings read/write paths**

In the `readAppSettings().then` handler, replace appearance restoration with:

```ts
if (!touchedPreferences.current.appearanceTheme) {
  const restoredThemeSettings =
    settings.themeSettings ?? migratePersistedAppearanceTheme(settings.appearanceTheme);
  if (restoredThemeSettings) {
    setThemeSettings(restoredThemeSettings);
    saveThemeSettings(restoredThemeSettings);
  }
}
```

Add helper in `App.tsx`:

```ts
function migratePersistedAppearanceTheme(value: unknown): ThemeSettings | null {
  if (value === "galley-light" || value === "galley-dark") {
    return {
      ...DEFAULT_THEME_SETTINGS,
      mode: "constant",
      constantThemeId: value,
    };
  }

  if (value === "system") {
    return DEFAULT_THEME_SETTINGS;
  }

  return null;
}
```

Update current settings snapshot:

```ts
themeSettings: latestThemeSettings.current,
```

Remove `appearanceTheme` from new writes after migration support is in place.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm run test:unit -- src/App.test.tsx src/components/DocumentView.test.tsx
```

Expected: PASS after updating old assertions to look at theme settings and `data-testid="app-shell"`.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/components/DocumentView.tsx src/components/DocumentView.test.tsx
git commit -m "feat(app): resolve theme settings"
```

---

### Task 6: Replace Theme Settings UI With Mode And Theme Comboboxes

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing settings UI tests**

Update the settings test in `src/App.test.tsx` to use the new controls:

```ts
it("opens settings from the native menu and persists theme mode and selections", async () => {
  let menuHandler: ((command: AppMenuCommand) => void) | null = null;
  listenForAppMenuCommandMock.mockImplementation(async (handler) => {
    menuHandler = handler;
    return () => undefined;
  });
  render(<App />);

  await waitFor(() => {
    expect(listenForAppMenuCommandMock).toHaveBeenCalled();
  });
  act(() => {
    menuHandler?.("settings");
  });

  await screen.findByRole("dialog", { name: "Settings" });
  fireEvent.click(screen.getByRole("radio", { name: "Constant" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), {
    target: { value: "catppuccin-mocha" },
  });

  expect(screen.queryByRole("combobox", { name: "Light theme" })).not.toBeInTheDocument();
  await waitFor(() => {
    expect(writeAppSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        themeSettings: expect.objectContaining({
          mode: "constant",
          constantThemeId: "catppuccin-mocha",
        }),
      }),
    );
  });
});

it("shows separate light and dark theme selectors in system-based mode", async () => {
  render(<App />);

  fireEvent.keyDown(window, { key: ",", ctrlKey: true });
  await screen.findByRole("dialog", { name: "Settings" });
  fireEvent.click(screen.getByRole("radio", { name: "System-based" }));

  expect(screen.getByRole("combobox", { name: "Light theme" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Dark theme" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Light theme" }), {
    target: { value: "solarized-light" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Dark theme" }), {
    target: { value: "tokyo-night" },
  });

  await waitFor(() => {
    expect(writeAppSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        themeSettings: expect.objectContaining({
          mode: "system",
          lightThemeId: "solarized-light",
          darkThemeId: "tokyo-night",
        }),
      }),
    );
  });
});

it("renders native theme mode disabled until a provider exists", async () => {
  render(<App />);

  fireEvent.keyDown(window, { key: ",", ctrlKey: true });
  await screen.findByRole("dialog", { name: "Settings" });

  expect(screen.getByRole("radio", { name: /Native/ })).toBeDisabled();
  expect(screen.getByText("Native shell colors are not available yet.")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- src/App.test.tsx
```

Expected: FAIL because the new controls do not exist.

- [ ] **Step 3: Add theme settings update helpers**

In `src/App.tsx`:

```ts
function updateThemeSettings(next: ThemeSettings) {
  touchedPreferences.current.appearanceTheme = true;
  saveThemeSettings(next);
  persistAppSettings({ themeSettings: next });
  setThemeSettings(next);
}

function updateThemeMode(mode: ThemeSettings["mode"]) {
  updateThemeSettings({ ...themeSettings, mode });
}

function updateConstantTheme(themeId: string) {
  updateThemeSettings({ ...themeSettings, constantThemeId: themeId });
}

function updateLightTheme(themeId: string) {
  updateThemeSettings({ ...themeSettings, lightThemeId: themeId });
}

function updateDarkTheme(themeId: string) {
  updateThemeSettings({ ...themeSettings, darkThemeId: themeId });
}
```

Use `ThemeId` instead of `string` if TypeScript narrowing is straightforward at the select boundary.

- [ ] **Step 4: Replace theme fieldset UI**

In the settings dialog, replace the current `APPEARANCE_THEMES.map` fieldset with the
new theme-mode radio group. The first implementation may use native selects as a
v1 control, but the approved picker UX remains a richer swatch-based picker/combobox
fed from `BUILT_IN_THEMES` and `listThemesByScheme()`. Do not revert to the legacy
`APPEARANCE_THEMES.map` radio list.

```tsx
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
  <label>
    <input
      type="radio"
      name="theme-mode"
      checked={themeSettings.mode === "system"}
      onChange={() => updateThemeMode("system")}
    />
    System-based
  </label>
  <label aria-describedby="native-theme-help">
    <input type="radio" name="theme-mode" disabled checked={false} onChange={() => undefined} />
    Native
  </label>
  <p id="native-theme-help" className="settings-help">
    Native shell colors are not available yet.
  </p>

  {themeSettings.mode === "constant" ? (
    <label className="settings-field">
      Theme
      <select
        aria-label="Theme"
        value={themeSettings.constantThemeId}
        onChange={(event) => updateConstantTheme(event.currentTarget.value)}
      >
        {BUILT_IN_THEMES.map((theme) => (
          <option key={theme.id} value={theme.id}>
            {theme.label} ({theme.family}, {theme.scheme})
          </option>
        ))}
      </select>
    </label>
  ) : null}

  {themeSettings.mode === "system" ? (
    <>
      <label className="settings-field">
        Light theme
        <select
          aria-label="Light theme"
          value={themeSettings.lightThemeId}
          onChange={(event) => updateLightTheme(event.currentTarget.value)}
        >
          {listThemesByScheme("light").map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.label} ({theme.family})
            </option>
          ))}
        </select>
      </label>
      <label className="settings-field">
        Dark theme
        <select
          aria-label="Dark theme"
          value={themeSettings.darkThemeId}
          onChange={(event) => updateDarkTheme(event.currentTarget.value)}
        >
          {listThemesByScheme("dark").map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.label} ({theme.family})
            </option>
          ))}
        </select>
      </label>
    </>
  ) : null}
</fieldset>
```

This code sample is the native-select v1 baseline. If the task scope includes the
approved picker UX, replace each `<select>` with the project picker component:
constant mode reads from `BUILT_IN_THEMES`, system-based mode reads from
`listThemesByScheme("light")` and `listThemesByScheme("dark")`, and each option
must expose a theme swatch plus label/family metadata.

- [ ] **Step 5: Add minimal styles**

Add to `src/styles.css` near settings styles:

```css
.settings-help {
  margin: -4px 0 0 24px;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.35;
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm run test:unit -- src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat(app): add theme mode settings"
```

---

### Task 7: Move Hard-Coded Theme Variables Out Of CSS

**Files:**
- Modify: `src/styles.css`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write failing regression test for shell-applied variables**

Add to `src/App.test.tsx`:

```ts
it("applies theme variables on the app shell for chrome and editor inheritance", async () => {
  render(<App />);

  const shell = screen.getByTestId("app-shell");
  expect(shell.style.getPropertyValue("--app-panel")).toBeTruthy();
  expect(shell.style.getPropertyValue("--app-border")).toBeTruthy();
  expect(shell.style.getPropertyValue("--ge-color-text")).toBeTruthy();
  expect(shell.style.getPropertyValue("--ge-color-code-fence-bg")).toBeTruthy();
  expect(shell.style.getPropertyValue("--ge-color-token-string")).toBeTruthy();
});
```

- [ ] **Step 2: Remove old theme blocks from CSS**

In `src/styles.css`, remove:

- `:root, .theme-galley-light, .theme-system { ... --ge-color-* ... }`
- `.theme-galley-light { color-scheme: light; }`
- `.theme-galley-dark { ... }`
- `@media (prefers-color-scheme: dark) { .theme-system { ... } }`

Keep `:root` defaults for base `color-scheme`, font family, background, and color as a fallback. Component selectors should continue to use `var(--app-*)` and `var(--ge-*)`.

- [ ] **Step 3: Run CSS and app tests**

Run:

```bash
npm run test:unit -- src/App.test.tsx
npm run build
```

Expected: PASS. The app shell inline variables should satisfy component variable usage.

- [ ] **Step 4: Commit**

```bash
git add src/styles.css src/App.test.tsx
git commit -m "refactor(themes): apply theme variables from catalog"
```

---

### Task 8: Replace Text Close Buttons With Lucide Icons

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing accessible icon tests**

Add to `src/App.test.tsx`:

```ts
it("uses icon-only close and dismiss buttons with accessible names", async () => {
  render(<App />);

  expect(screen.getByRole("button", { name: "Close Untitled.md" })).toHaveTextContent(
    "",
  );

  readTextFileMock.mockRejectedValueOnce(new Error("open failed"));
  fireEvent.keyDown(window, { key: "o", ctrlKey: true });
  pickOpenFileMock.mockResolvedValueOnce("/tmp/fail.md");

  const dismiss = await screen.findByRole("button", {
    name: "Dismiss file command error",
  });
  expect(dismiss).toHaveTextContent("");

  fireEvent.keyDown(window, { key: ",", ctrlKey: true });
  const closeSettingsButton = await screen.findByRole("button", {
    name: "Close settings",
  });
  expect(closeSettingsButton).toHaveTextContent("");
});
```

If this test is brittle because the mock editor contributes text, prefer asserting each button contains an `svg`:

```ts
expect(closeSettingsButton.querySelector("svg")).not.toBeNull();
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- src/App.test.tsx
```

Expected: FAIL because buttons still render `x`.

- [ ] **Step 3: Replace text with Lucide `X`**

Modify `src/App.tsx` import:

```ts
import { X } from "lucide-react";
```

Replace each text close body:

```tsx
<X size={14} strokeWidth={2} aria-hidden="true" />
```

For settings and command error buttons use size `16` if it fits better:

```tsx
<X size={16} strokeWidth={2} aria-hidden="true" />
```

- [ ] **Step 4: Normalize icon button CSS**

Add to `src/styles.css`:

```css
.tab-close,
.command-error button,
.settings-dialog-header button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tab-close svg,
.command-error button svg,
.settings-dialog-header button svg {
  display: block;
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test:unit -- src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/styles.css
git commit -m "fix(app): use icons for close controls"
```

---

### Task 9: Verify Galley Editor Variable Coverage

**Files:**
- Inspect: `galley-editor/`
- Modify: `galley-editor` package files only when Step 1 proves a rendered element ignores `--ge-*` variables.
- Modify: `galley-editor/known-issues.md` only when a package test cannot cover proven missing variable coverage.

- [ ] **Step 1: Inspect Galley Editor variable usage**

Run:

```bash
rg -n -- '--ge-color-|ge-color|code|blockquote|table|selection|token' galley-editor/src galley-editor
```

Expected: output identifies the CSS rules for editor backgrounds, code blocks, blockquotes, tables, selection, and syntax tokens.

- [ ] **Step 2: Decide whether editor package changes are needed**

If every element listed in the spec already consumes `--ge-*` variables, do not modify the submodule. Record the result in the final implementation summary.

If coverage is missing, make only cross-platform Galley Editor changes. Do not import Galley Pad theme names into the editor package.

- [ ] **Step 3: Add editor package test or known issue**

If code changes are needed in `galley-editor`, add a focused test according to that package's test setup. If the package lacks an easy test path for the exact CSS coverage, record the concrete selector and element in `galley-editor/known-issues.md`. For a fenced code block background gap, the note is:

```md
## Missing theme variable coverage for rendered Markdown

- Observed behavior: `.ge-code-block` uses a hard-coded background instead of `--ge-color-code-fence-bg`.
- Expected behavior: rendered Markdown code blocks should inherit Galley Editor theme variables.
- Reproduction steps: open Galley Pad with Tokyo Night selected and inspect a fenced code block.
- Galley Pad impact: theme catalog cannot fully affect fenced code block backgrounds.
- Next action: add variable coverage in Galley Editor CSS.
```

For a different coverage gap, write the same five bullets with the exact selector, rendered element, reproduction theme, and affected token from Step 1.

- [ ] **Step 4: Run editor/package checks**

If `galley-editor` changes:

```bash
cd galley-editor
npm test
npm run build
git status --short
```

Expected: package checks pass, or document any pre-existing failures.

- [ ] **Step 5: Commit submodule changes separately when Step 2 finds missing coverage**

If `galley-editor` changes:

```bash
cd galley-editor
git add .
git commit -m "fix(editor): expand theme variable coverage"
git status --short
cd ..
git add galley-editor
git commit -m "chore: update galley editor theme coverage"
```

If no editor changes are needed, skip this commit.

---

### Task 10: Full Verification And Final Commit

**Files:**
- Modify only files touched by earlier tasks when verification identifies a regression from this theme-engine work.
- Inspect: `docs/known-issues.md` if verification reveals environment-specific failures.

- [ ] **Step 1: Run focused theme tests**

Run:

```bash
npm run test:unit -- src/themes/style.test.ts src/themes/catalog.test.ts src/themes/settings.test.ts src/themes/resolve.test.ts src/settings/appearance.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused app tests**

Run:

```bash
npm run test:unit -- src/App.test.tsx src/components/DocumentView.test.tsx src/tauri/appPersistence.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run integration tests**

Run:

```bash
npm run test:integration
```

Expected: PASS. If Playwright fails because of an environment issue, inspect the trace and update tests or code only if the failure is caused by this change.

- [ ] **Step 4: Run fast verification**

Run:

```bash
npm run verify:fast
```

Expected: PASS. Existing Rust warnings about unused variables may remain.

- [ ] **Step 5: Run full verification before final handoff**

Run:

```bash
npm run verify
```

Expected: PASS. If `tauri info` times out with the known timeout behavior, continue only if the script proceeds to the debug no-bundle Tauri build and that build passes.

- [ ] **Step 6: Check final status**

Run:

```bash
git status --branch --short
git log --oneline -8
```

Expected: working tree clean except for intentional uncommitted changes from verification outputs. If files changed, inspect and either commit intentional fixes or remove generated artifacts that are ignored by project policy.

- [ ] **Step 7: Final implementation commit for verification fixes**

If verification required final fixes:

```bash
git add src tests docs
git commit -m "fix(themes): stabilize theme engine"
```

If no files changed after prior task commits, skip this step.

---

## Self-Review Notes

- Spec coverage: Tasks cover typed tokens, built-in catalog, constant/system/native-disabled settings, app/editor variable propagation, persistence migration, Lucide close icons, Galley Editor package boundary, and validation.
- Scope: Native GTK/KDE palette provider, custom themes, and import/export are intentionally excluded.
- Type consistency: `ThemeSettings`, `ThemeMode`, `ThemeId`, `ThemeDefinition`, and `ThemeScheme` are introduced in `src/themes/` and consumed from that module throughout the plan.
