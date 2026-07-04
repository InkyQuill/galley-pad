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

  it("classifies final-line substitutions as changed rows", () => {
    expect(createSideBySideLineDiff("A\nOld\n", "A\nNew\n")).toEqual([
      { kind: "unchanged", left: "A", right: "A" },
      { kind: "changed", left: "Old", right: "New" },
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

  it("uses a bounded linear fallback for large inputs", () => {
    const left = Array.from({ length: 350 }, (_, index) => `L${index}`).join("\n");
    const right = Array.from({ length: 350 }, (_, index) => `R${index}`).join(
      "\n",
    );

    const rows = createSideBySideLineDiff(left, right);

    expect(rows).toHaveLength(350);
    expect(rows[0]).toEqual({ kind: "changed", left: "L0", right: "R0" });
    expect(rows[rows.length - 1]).toEqual({
      kind: "changed",
      left: "L349",
      right: "R349",
    });
  });
});
