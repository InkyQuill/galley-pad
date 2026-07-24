import { describe, expect, it } from "vitest";
import { DEFAULT_WORD_WRAP, normalizeWordWrap } from "./wordWrap";

describe("word wrap settings", () => {
  it("keeps persisted booleans", () => {
    expect(normalizeWordWrap(true)).toBe(true);
    expect(normalizeWordWrap(false)).toBe(false);
  });

  it.each([undefined, null, "false", 0, {}, []])(
    "defaults malformed value %j to enabled",
    (value) => {
      expect(normalizeWordWrap(value)).toBe(DEFAULT_WORD_WRAP);
    },
  );
});
