import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSwapState, writeSwapState } from "./appPersistence";
import type { PersistedSwapState } from "./appPersistence";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("app persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
  });

  it("returns valid persisted swap state from Tauri", async () => {
    const state = validSwapState();
    invokeMock.mockResolvedValue(state);

    await expect(readSwapState()).resolves.toEqual(state);
  });

  it("ignores malformed persisted swap state", async () => {
    invokeMock.mockResolvedValue({
      version: 1,
      savedAt: 1,
      activeTabId: "tab",
      openMode: "tabs",
      tabs: [{ id: "tab", session: { id: "session" } }],
    });

    await expect(readSwapState()).resolves.toBeNull();
  });

  it("writes swap state through Tauri unchanged", async () => {
    const state = validSwapState();
    invokeMock.mockResolvedValue(undefined);

    await writeSwapState(state);

    expect(invokeMock).toHaveBeenCalledWith("write_swap_state", { state });
  });
});

function validSwapState(): PersistedSwapState {
  return {
    version: 1,
    savedAt: 1,
    activeTabId: "tab",
    openMode: "tabs",
    tabs: [
      {
        id: "tab",
        session: {
          id: "session",
          path: null,
          displayName: "Untitled.md",
          content: "Dirty",
          savedContent: "",
          dirty: true,
          lineEnding: "lf",
          lastKnownModifiedAt: null,
        },
      },
    ],
  };
}
