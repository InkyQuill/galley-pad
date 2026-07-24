import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncWordWrapMenuChecked } from "./nativeMenu";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

describe("native menu state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("does nothing outside Tauri", async () => {
    await syncWordWrapMenuChecked(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("sets the checked state inside Tauri", async () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    invokeMock.mockResolvedValue(undefined);

    await syncWordWrapMenuChecked(false);

    expect(invokeMock).toHaveBeenCalledWith("set_word_wrap_menu_checked", {
      checked: false,
    });
  });
});
