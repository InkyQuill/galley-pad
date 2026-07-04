import { describe, expect, it } from "vitest";
import { createSideBySideLineDiff } from "./diff";

describe("side-by-side line diff", () => {
  it("aligns unchanged and changed rows", () => {
    expect(createSideBySideLineDiff("A\nOld\nC\n", "A\nNew\nC\n")).toEqual([
      { kind: "unchanged", left: "A", right: "A" },
      { kind: "changed", left: "Old", right: "New" },
      { kind: "unchanged", left: "C", right: "C" },
    ]);
  });

  it("uses empty cells for pure additions", () => {
    expect(createSideBySideLineDiff("A\nB\n", "A\nC\nB\nD\n")).toEqual([
      { kind: "unchanged", left: "A", right: "A" },
      { kind: "added", left: "", right: "C" },
      { kind: "unchanged", left: "B", right: "B" },
      { kind: "added", left: "", right: "D" },
    ]);
  });

  it("uses empty cells for pure removals", () => {
    expect(createSideBySideLineDiff("A\nC\nB\nD\n", "A\nB\n")).toEqual([
      { kind: "unchanged", left: "A", right: "A" },
      { kind: "removed", left: "C", right: "" },
      { kind: "unchanged", left: "B", right: "B" },
      { kind: "removed", left: "D", right: "" },
    ]);
  });

  it("normalizes CRLF and ignores a final trailing newline", () => {
    expect(createSideBySideLineDiff("A\r\nB\r\n", "A\nB\n")).toEqual([
      { kind: "unchanged", left: "A", right: "A" },
      { kind: "unchanged", left: "B", right: "B" },
    ]);
  });
});
