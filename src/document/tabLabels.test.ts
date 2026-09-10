import { describe, expect, it } from "vitest";
import { computeTabPathHints } from "./tabLabels";

type Tab = { id: string; displayName: string; path: string | null };

function tab(id: string, displayName: string, path: string | null): Tab {
  return { id, displayName, path };
}

describe("computeTabPathHints", () => {
  it("gives no hint when display names are unique", () => {
    const hints = computeTabPathHints([
      tab("a", "notes.md", "/home/u/projectA/notes.md"),
      tab("b", "todo.md", "/home/u/projectA/todo.md"),
    ]);

    expect(hints.get("a")).toBeNull();
    expect(hints.get("b")).toBeNull();
  });

  it("hints with the nearest parent directory for same-named files", () => {
    const hints = computeTabPathHints([
      tab("a", "notes.md", "/home/u/projectA/notes.md"),
      tab("b", "notes.md", "/home/u/projectB/notes.md"),
    ]);

    expect(hints.get("a")).toBe("projectA");
    expect(hints.get("b")).toBe("projectB");
  });

  it("expands to more segments when the nearest parents collide", () => {
    const hints = computeTabPathHints([
      tab("a", "notes.md", "/home/u/alpha/docs/notes.md"),
      tab("b", "notes.md", "/home/u/beta/docs/notes.md"),
    ]);

    expect(hints.get("a")).toBe("alpha/docs");
    expect(hints.get("b")).toBe("beta/docs");
  });

  it("leaves untitled tabs without hints", () => {
    const hints = computeTabPathHints([
      tab("a", "Untitled.md", null),
      tab("b", "Untitled.md", null),
    ]);

    expect(hints.get("a")).toBeNull();
    expect(hints.get("b")).toBeNull();
  });

  it("hints a file-backed tab even when its duplicate has no path", () => {
    const hints = computeTabPathHints([
      tab("a", "notes.md", "/home/u/projectA/notes.md"),
      tab("b", "notes.md", null),
    ]);

    expect(hints.get("a")).toBe("projectA");
    expect(hints.get("b")).toBeNull();
  });

  it("handles windows path separators", () => {
    const hints = computeTabPathHints([
      tab("a", "notes.md", "C:\\docs\\alpha\\notes.md"),
      tab("b", "notes.md", "C:\\docs\\beta\\notes.md"),
    ]);

    expect(hints.get("a")).toBe("alpha");
    expect(hints.get("b")).toBe("beta");
  });

  it("falls back to the full parent path for identical directories", () => {
    const hints = computeTabPathHints([
      tab("a", "notes.md", "/home/u/projectA/notes.md"),
      tab("b", "notes.md", "/home/u/projectA/notes.md"),
    ]);

    expect(hints.get("a")).toBe("home/u/projectA");
    expect(hints.get("b")).toBe("home/u/projectA");
  });
});
