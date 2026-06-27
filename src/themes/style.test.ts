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
