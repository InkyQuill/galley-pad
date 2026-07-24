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
    const handler = vi.fn();

    await listenForAppMenuCommand(handler);

    expect(listenMock).toHaveBeenCalledWith(
      APP_MENU_COMMAND_EVENT,
      expect.any(Function),
    );

    const listener = listenMock.mock.calls[0]?.[1];
    listener?.({ event: APP_MENU_COMMAND_EVENT, id: 1, payload: "find" });
    listener?.({
      event: APP_MENU_COMMAND_EVENT,
      id: 2,
      payload: "toggle-word-wrap",
    });

    expect(handler).toHaveBeenNthCalledWith(1, "find");
    expect(handler).toHaveBeenNthCalledWith(2, "toggle-word-wrap");
  });
});
