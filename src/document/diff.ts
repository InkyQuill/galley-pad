export type SideBySideDiffKind = "unchanged" | "added" | "removed" | "changed";

export type SideBySideDiffRow = {
  kind: SideBySideDiffKind;
  left: string;
  right: string;
};

export function createSideBySideLineDiff(
  leftText: string,
  rightText: string,
): SideBySideDiffRow[] {
  const left = splitLines(leftText);
  const right = splitLines(rightText);
  const table = lcsTable(left, right);
  const rows: SideBySideDiffRow[] = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      rows.push({ kind: "unchanged", left: left[i], right: right[j] });
      i += 1;
      j += 1;
    } else if (
      i + 1 < left.length &&
      j + 1 < right.length &&
      left[i + 1] === right[j + 1]
    ) {
      rows.push({ kind: "changed", left: left[i], right: right[j] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] === table[i][j + 1]) {
      rows.push({ kind: "changed", left: left[i], right: right[j] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      rows.push({ kind: "removed", left: left[i], right: "" });
      i += 1;
    } else {
      rows.push({ kind: "added", left: "", right: right[j] });
      j += 1;
    }
  }

  while (i < left.length) {
    rows.push({ kind: "removed", left: left[i], right: "" });
    i += 1;
  }

  while (j < right.length) {
    rows.push({ kind: "added", left: "", right: right[j] });
    j += 1;
  }

  return rows;
}

function splitLines(value: string): string[] {
  if (value === "") {
    return [];
  }

  const lines = value.replace(/\r\n/g, "\n").split("\n");
  if (value.endsWith("\n")) {
    lines.pop();
  }
  return lines;
}

function lcsTable(left: string[], right: string[]): number[][] {
  const table = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => 0),
  );

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        left[i] === right[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  return table;
}
