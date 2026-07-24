import { invoke, isTauri } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncWordWrapMenuChecked } from "./nativeMenu";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const isTauriMock = vi.mocked(isTauri);

describe("native menu state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTauriMock.mockReturnValue(false);
  });

  it("does nothing outside Tauri", async () => {
    await syncWordWrapMenuChecked(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("sets the checked state inside Tauri", async () => {
    isTauriMock.mockReturnValue(true);
    invokeMock.mockResolvedValue(undefined);

    await syncWordWrapMenuChecked(false);

    expect(invokeMock).toHaveBeenCalledWith("set_word_wrap_menu_checked", {
      checked: false,
    });
  });
});
