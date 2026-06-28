# Galley Pad Theme Engine Design

## Goal

Galley Pad needs a typed theme engine that can ship popular built-in themes, apply them consistently to the app chrome and Galley Editor, and support user choice between one constant theme or separate light and dark themes that follow the system color scheme.

The editor package remains themeable but does not ship Galley Pad themes. Galley Pad owns the theme catalog and passes colors to Galley Editor through inherited CSS variables.

## Non-Goals

- No custom theme editor in this pass.
- No user theme import or export in this pass.
- No native GTK/KDE color provider in this pass. The settings model reserves a `native` mode, but the option is disabled until provider support exists.
- No theme-name coupling inside `@inky/galley-editor`.

## Theme Model

Add a theme engine under `src/themes/`:

- `tokens.ts` defines the typed token contract.
- `catalog.ts` defines built-in themes and metadata.
- `resolve.ts` resolves saved settings and system color scheme into the active theme.
- `style.ts` converts tokens into React `CSSProperties` with CSS variables.
- `settings.ts` owns persistence helpers and migration from the existing appearance setting.

The persisted settings shape is:

```ts
type ThemeMode = "constant" | "system" | "native";

type ThemeSettings = {
  mode: ThemeMode;
  constantThemeId: ThemeId;
  lightThemeId: ThemeId;
  darkThemeId: ThemeId;
};
```

Resolution rules:

- `constant` always uses `constantThemeId`.
- `system` uses `lightThemeId` when the system scheme is light and `darkThemeId` when it is dark.
- `native` is disabled for now. Later it can resolve from Tauri-provided shell palette tokens.

The app should listen for `prefers-color-scheme` changes while in `system` mode and update the active resolved theme without requiring restart.

## Token Contract

Themes use semantic tokens. The CSS output keeps current variable names where possible so existing selectors remain stable.

Core app tokens:

- `app.bg`
- `app.text`
- `app.panel`
- `app.panelMuted`
- `app.border`
- `app.textMuted`
- `app.tabText`
- `app.hover`
- `app.focus`
- `app.errorBg`
- `app.errorBorder`
- `app.errorText`
- `app.dialogShadow`
- `app.backdrop`

Editor tokens mapped to Galley Editor variables:

- `editor.text`
- `editor.textMuted`
- `editor.bg`
- `editor.surface`
- `editor.surfaceElevated`
- `editor.border`
- `editor.link`
- `editor.linkHover`
- `editor.selection`
- `editor.caret`
- `editor.focusRing`
- `editor.scrollbarThumb`
- `editor.scrollbarThumbHover`

Markdown rendered content tokens:

- `markdown.codeFg`
- `markdown.codeBg`
- `markdown.codeFenceBg`
- `markdown.codeHeaderBg`
- `markdown.blockquoteBorder`
- `markdown.blockquoteFg`
- `markdown.divider`
- `markdown.tableBorder`
- `markdown.checkboxAccent`

Syntax tokens:

- `syntax.keyword`
- `syntax.string`
- `syntax.number`
- `syntax.comment`
- `syntax.variable`
- `syntax.type`
- `syntax.function`
- `syntax.operator`
- `syntax.punctuation`

Theme definitions include the full syntax token set even if the current Galley Editor consumes only a subset. The wider token shape prevents a future breaking redesign when rendered code highlighting grows.

## Built-In Themes

The first catalog includes:

- Galley Light
- Galley Dark
- Gruvbox Light
- Gruvbox Dark
- Catppuccin Latte
- Catppuccin Mocha
- Tokyo Night Day
- Tokyo Night
- Nord Light
- Nord Dark
- Darcula
- Solarized Light
- Solarized Dark

Each theme definition includes:

- stable `id`
- display `label`
- `family`, for grouped UI display
- `scheme`: `light` or `dark`
- token values
- preview swatches derived from key tokens

## Settings UX

Replace the current theme radio list with:

- A radio group: `Constant`, `System-based`, `Native`.
- `Constant`: one theme combobox.
- `System-based`: two theme comboboxes, `Light theme` and `Dark theme`, filtered by compatible scheme.
- `Native`: disabled until a native provider exists.

Theme combobox options show:

- theme label
- family/category
- light or dark badge
- small swatches for background, panel, accent/link, and syntax colors

Selections update the app immediately and persist through the app settings write path.

The disabled Native option should communicate unavailable state through disabled UI and accessible helper text, not a modal.

## App And Editor Integration

`App` resolves the active theme and applies generated CSS variables to `.app-shell` through a style object. App chrome, dialogs, tabs, font picker, error messages, and other controls continue reading `--app-*` variables.

`DocumentView` continues passing only the editor scheme behavior into Galley Editor: `light`, `dark`, or `auto`. Actual color values are inherited as `--ge-*` variables from the app shell and editor surface.

Galley Editor remains responsible for honoring its documented `--ge-*` variables across:

- editor background and text
- toolbar and footer surfaces
- selection and caret
- links
- inline code
- fenced code blocks
- code block headers
- blockquotes
- dividers
- tables
- checkboxes
- HTML/rendered Markdown blocks
- syntax token colors where exposed

If Galley Editor is missing variable coverage for any rendered element, fix that in the editor package as cross-platform theming support, not as a Galley Pad-specific workaround.

## Icon Cleanup

Replace text `x` controls with Lucide `X` icons in:

- tab close buttons
- settings dialog close button
- command error dismiss button

Accessible labels stay explicit, for example `Close settings` and `Dismiss file command error`.

## Migration

Existing `galley-pad.appearanceTheme` values migrate to the new settings:

- `system` becomes `mode: "system"` with Galley Light and Galley Dark defaults.
- `galley-light` becomes `mode: "constant"` and `constantThemeId: "galley-light"`.
- `galley-dark` becomes `mode: "constant"` and `constantThemeId: "galley-dark"`.

Legacy `galley-pad.editorTheme` migration remains supported through the same path.

The persisted Tauri app settings should store the new theme settings object. During migration, reading old settings should still produce a complete `ThemeSettings` object.

## Testing

Add focused tests for:

- theme settings load/save
- migration from `galley-pad.appearanceTheme` and legacy `galley-pad.editorTheme`
- constant theme resolution
- system-based light/dark resolution
- live `prefers-color-scheme` update behavior
- CSS variable mapping for app, editor, markdown, and syntax tokens
- settings UI conditional rendering for one or two theme comboboxes
- disabled Native option state
- Galley Editor receiving inherited variables instead of theme names
- Lucide close buttons retaining accessible labels

## Validation

Before implementation completion, run:

```bash
npm run test:unit
npm run test:integration
npm run verify:fast
```

Use `npm run verify` before the final implementation commit if the changes touch Tauri persistence or packaging behavior.
