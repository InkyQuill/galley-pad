import { beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import {
  APP_MENU_COMMAND_EVENT,
  listenForAppMenuCommand,
} from "./menuEvents";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

const listenMock = vi.mocked(listen);

describe("native menu events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("does nothing in a plain browser without Tauri internals", async () => {
    const unlisten = await listenForAppMenuCommand(() => undefined);

    expect(listenMock).not.toHaveBeenCalled();
    expect(() => unlisten()).not.toThrow();
  });

  it("listens for app menu command events inside Tauri", async () => {
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    listenMock.mockResolvedValue(() => undefined);

    await listenForAppMenuCommand(() => undefined);

    expect(listenMock).toHaveBeenCalledWith(
      APP_MENU_COMMAND_EVENT,
      expect.any(Function),
    );
  });
});
