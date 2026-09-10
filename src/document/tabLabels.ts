type TabForHint = {
  id: string;
  displayName: string;
  path: string | null;
};

/**
 * Distinguishing path hints for tabs that share a display name, in the style
 * of other editors: the shortest trailing directory path that tells the
 * duplicates apart ("notes.md — projectA" vs "notes.md — projectB").
 * Tabs with unique names or without a file path get a null hint.
 */
export function computeTabPathHints(
  tabs: ReadonlyArray<TabForHint>,
): Map<string, string | null> {
  const hints = new Map<string, string | null>();
  const groups = new Map<string, TabForHint[]>();

  for (const tab of tabs) {
    hints.set(tab.id, null);
    const group = groups.get(tab.displayName) ?? [];
    group.push(tab);
    groups.set(tab.displayName, group);
  }

  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }

    const segmentsByTab = new Map<string, string[]>();
    for (const tab of group) {
      if (tab.path) {
        segmentsByTab.set(tab.id, parentSegments(tab.path));
      }
    }

    for (const tab of group) {
      const segments = segmentsByTab.get(tab.id);
      if (!segments || segments.length === 0) {
        continue;
      }

      const otherSegments = group
        .filter((other) => other.id !== tab.id)
        .map((other) => segmentsByTab.get(other.id))
        .filter((other): other is string[] => other !== undefined);

      let depth = 1;
      while (
        depth < segments.length &&
        otherSegments.some(
          (other) => trailingPath(other, depth) === trailingPath(segments, depth),
        )
      ) {
        depth += 1;
      }

      hints.set(tab.id, trailingPath(segments, depth));
    }
  }

  return hints;
}

function parentSegments(path: string): string[] {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  segments.pop();
  return segments;
}

function trailingPath(segments: string[], depth: number): string {
  return segments.slice(-depth).join("/");
}
