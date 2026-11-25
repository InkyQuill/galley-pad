export type SideBySideDiffKind = "unchanged" | "added" | "removed" | "changed";

export type SideBySideDiffRow = {
  kind: SideBySideDiffKind;
  left: string;
  right: string;
};

type LineMatch = { left: number; right: number };

const MAX_LCS_CELLS = 1_000_000;
const REALIGNMENT_WINDOW = 32;

export function createSideBySideLineDiff(
  leftText: string,
  rightText: string,
): SideBySideDiffRow[] {
  const left = splitLines(leftText);
  const right = splitLines(rightText);
  const rows: SideBySideDiffRow[] = [];

  if (fitsLcsTable(left, right)) {
    appendSmallDiff(rows, left, right);
  } else {
    appendLargeDiff(rows, left, right);
  }
  return rows;
}

function appendLargeDiff(
  rows: SideBySideDiffRow[],
  left: string[],
  right: string[],
) {
  let start = 0;
  let leftEnd = left.length;
  let rightEnd = right.length;

  while (start < leftEnd && start < rightEnd && left[start] === right[start]) {
    rows.push({ kind: "unchanged", left: left[start], right: right[start] });
    start += 1;
  }
  while (
    leftEnd > start &&
    rightEnd > start &&
    left[leftEnd - 1] === right[rightEnd - 1]
  ) {
    leftEnd -= 1;
    rightEnd -= 1;
  }

  const leftMiddle = left.slice(start, leftEnd);
  const rightMiddle = right.slice(start, rightEnd);
  const anchors = inOrderUniqueMatches(leftMiddle, rightMiddle);
  let leftStart = 0;
  let rightStart = 0;

  for (const anchor of anchors) {
    appendGap(
      rows,
      leftMiddle.slice(leftStart, anchor.left),
      rightMiddle.slice(rightStart, anchor.right),
    );
    const line = leftMiddle[anchor.left];
    rows.push({ kind: "unchanged", left: line, right: line });
    leftStart = anchor.left + 1;
    rightStart = anchor.right + 1;
  }
  appendGap(rows, leftMiddle.slice(leftStart), rightMiddle.slice(rightStart));

  while (leftEnd < left.length) {
    rows.push({ kind: "unchanged", left: left[leftEnd], right: right[rightEnd] });
    leftEnd += 1;
    rightEnd += 1;
  }
}

function inOrderUniqueMatches(left: string[], right: string[]): LineMatch[] {
  const leftIndexes = uniqueLineIndexes(left);
  const rightIndexes = uniqueLineIndexes(right);
  const candidates: LineMatch[] = [];
  for (const [line, leftIndex] of leftIndexes) {
    const rightIndex = rightIndexes.get(line) ?? -1;
    if (leftIndex >= 0 && rightIndex >= 0) {
      candidates.push({ left: leftIndex, right: rightIndex });
    }
  }

  // Keep the longest ordered chain of unique matches so a moved line cannot
  // pull a whole unchanged section out of alignment.
  const tails: number[] = [];
  const predecessors: number[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (candidates[tails[middle]].right < candidates[index].right) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    predecessors[index] = low === 0 ? -1 : tails[low - 1];
    tails[low] = index;
  }

  const ordered: LineMatch[] = [];
  for (
    let index = tails[tails.length - 1] ?? -1;
    index >= 0;
    index = predecessors[index]
  ) {
    ordered.push(candidates[index]);
  }
  return ordered.reverse();
}

function uniqueLineIndexes(lines: string[]): Map<string, number> {
  const indexes = new Map<string, number>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    indexes.set(line, indexes.has(line) ? -1 : index);
  }
  return indexes;
}

function appendGap(
  rows: SideBySideDiffRow[],
  left: string[],
  right: string[],
) {
  if (left.length && right.length && fitsLcsTable(left, right)) {
    appendSmallDiff(rows, left, right);
  } else {
    appendWindowedDiff(rows, left, right);
  }
}

function appendWindowedDiff(
  rows: SideBySideDiffRow[],
  left: string[],
  right: string[],
) {
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      rows.push({ kind: "unchanged", left: left[i], right: right[j] });
      i += 1;
      j += 1;
      continue;
    }

    const skipLeft = nearbyMatch(left, i, right[j]);
    const skipRight = nearbyMatch(right, j, left[i]);
    if (skipLeft < skipRight) {
      rows.push({ kind: "removed", left: left[i], right: "" });
      i += 1;
    } else if (skipRight < skipLeft) {
      rows.push({ kind: "added", left: "", right: right[j] });
      j += 1;
    } else {
      rows.push({ kind: "changed", left: left[i], right: right[j] });
      i += 1;
      j += 1;
    }
  }
  appendGaps(rows, left, i, right, j);
}

function nearbyMatch(lines: string[], start: number, wanted: string): number {
  const end = Math.min(lines.length, start + REALIGNMENT_WINDOW + 1);
  for (let index = start + 1; index < end; index += 1) {
    if (lines[index] === wanted) return index - start;
  }
  return Infinity;
}

function appendSmallDiff(
  rows: SideBySideDiffRow[],
  left: string[],
  right: string[],
) {
  const width = right.length + 1;
  const table = lcsTable(left, right);
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    const skipLeft = table[(i + 1) * width + j];
    const skipRight = table[i * width + j + 1];
    if (left[i] === right[j]) {
      rows.push({ kind: "unchanged", left: left[i], right: right[j] });
      i += 1;
      j += 1;
    } else if (
      skipLeft === skipRight ||
      (i + 1 < left.length && j + 1 < right.length && left[i + 1] === right[j + 1])
    ) {
      rows.push({ kind: "changed", left: left[i], right: right[j] });
      i += 1;
      j += 1;
    } else if (skipLeft > skipRight) {
      rows.push({ kind: "removed", left: left[i], right: "" });
      i += 1;
    } else {
      rows.push({ kind: "added", left: "", right: right[j] });
      j += 1;
    }
  }
  appendGaps(rows, left, i, right, j);
}

function appendGaps(
  rows: SideBySideDiffRow[],
  left: string[],
  leftStart: number,
  right: string[],
  rightStart: number,
) {
  for (let index = leftStart; index < left.length; index += 1) {
    rows.push({ kind: "removed", left: left[index], right: "" });
  }
  for (let index = rightStart; index < right.length; index += 1) {
    rows.push({ kind: "added", left: "", right: right[index] });
  }
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

function fitsLcsTable(left: string[], right: string[]): boolean {
  return (left.length + 1) * (right.length + 1) <= MAX_LCS_CELLS;
}

function lcsTable(left: string[], right: string[]): Uint32Array {
  const width = right.length + 1;
  const table = new Uint32Array((left.length + 1) * width);

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        left[i] === right[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  return table;
}
