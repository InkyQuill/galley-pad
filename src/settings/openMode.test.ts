import { beforeEach, describe, expect, it } from "vitest";
import {
  loadOpenMode,
  OPEN_MODE_STORAGE_KEY,
  saveOpenMode,
} from "./openMode";

describe("open mode settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to opening files in tabs", () => {
    expect(loadOpenMode()).toBe("tabs");
  });

  it("saves and loads the separate windows preference", () => {
    saveOpenMode("windows");

    expect(localStorage.getItem(OPEN_MODE_STORAGE_KEY)).toBe("windows");
    expect(loadOpenMode()).toBe("windows");
  });

  it("ignores invalid stored values", () => {
    localStorage.setItem(OPEN_MODE_STORAGE_KEY, "sideways");

    expect(loadOpenMode()).toBe("tabs");
  });

  it("falls back to tabs when localStorage access throws", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage is unavailable");
      },
    });

    try {
      expect(loadOpenMode()).toBe("tabs");
      expect(() => saveOpenMode("windows")).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, "localStorage", descriptor!);
    }
  });
});
