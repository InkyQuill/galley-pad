import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readAppSettings,
  readSwapState,
  writeAppSettings,
  writeSwapState,
} from "./appPersistence";
import type {
  PersistedAppSettings,
  PersistedSwapState,
  RawPersistedAppSettings,
} from "./appPersistence";

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

  it("writes theme settings through Tauri unchanged", async () => {
    const settings: PersistedAppSettings = {
      themeSettings: {
        mode: "system",
        constantThemeId: "galley-light",
        lightThemeId: "solarized-light",
        darkThemeId: "tokyo-night",
      },
      editorFontFamily: "Fira Code",
      editorFontSize: "large",
      openMode: "tabs",
    };

    invokeMock.mockResolvedValue(undefined);

    await writeAppSettings(settings);

    expect(invokeMock).toHaveBeenCalledWith("write_app_settings", {
      settings: {
        themeSettings: {
          mode: "system",
          constantThemeId: "galley-light",
          lightThemeId: "solarized-light",
          darkThemeId: "tokyo-night",
        },
        editorFontFamily: "Fira Code",
        editorFontSize: "large",
        openMode: "tabs",
      },
    });
  });

  it("rejects malformed theme settings writes at type level", () => {
    if (false) {
      // @ts-expect-error write payloads require valid ThemeSettings
      void writeAppSettings({ themeSettings: "broken" });
    }

    expect(true).toBe(true);
  });

  it("returns old app settings without themeSettings from Tauri", async () => {
    const settings: PersistedAppSettings = {
      appearanceTheme: "galley-dark",
      editorFontFamily: "Fira Code",
      editorFontSize: "large",
      openMode: "tabs",
    };

    invokeMock.mockResolvedValue(settings);

    await expect(readAppSettings()).resolves.toEqual(settings);
  });

  it("returns malformed or null themeSettings from Tauri without throwing", async () => {
    const malformedSettings = {
      appearanceTheme: "galley-dark",
      themeSettings: {
        mode: "broken",
        constantThemeId: 42,
      },
      editorFontFamily: null,
      editorFontSize: "large",
      openMode: "tabs",
    } satisfies RawPersistedAppSettings;

    invokeMock.mockResolvedValueOnce(malformedSettings).mockResolvedValueOnce({
      ...malformedSettings,
      themeSettings: null,
    } satisfies RawPersistedAppSettings);

    await expect(readAppSettings()).resolves.toEqual(malformedSettings);
    await expect(readAppSettings()).resolves.toMatchObject({
      themeSettings: null,
    });
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
