import type { CSSProperties } from "react";

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

export type ThemeCssVariables = CSSProperties & Record<`--${string}`, string>;
