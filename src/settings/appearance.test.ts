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
