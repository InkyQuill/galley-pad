import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  APP_MENU_COMMAND_EVENT,
  listenForAppMenuCommand,
} from "./menuEvents";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

const listenMock = vi.mocked(listen);

describe("native menu events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue([]);
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("does nothing in a plain browser without Tauri internals", async () => {
    const unlisten = await listenForAppMenuCommand(() => undefined);

    expect(listenMock).not.toHaveBeenCalled();
    expect(() => unlisten()).not.toThrow();
  });

  it("receives menu commands queued before listener readiness", async () => {
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: "main" } } };
    listenMock.mockResolvedValue(() => undefined);
    vi.mocked(invoke).mockResolvedValue(["open-recent", "settings"]);
    const handler = vi.fn();

    await listenForAppMenuCommand(handler);

    expect(handler.mock.calls).toEqual([["open-recent"], ["settings"]]);
    expect(listenMock.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(invoke).mock.invocationCallOrder[0]);
  });

  it("listens for app menu command events inside Tauri", async () => {
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: "main" } } };
    listenMock.mockResolvedValue(() => undefined);
    const handler = vi.fn();

    await listenForAppMenuCommand(handler);

    expect(listenMock).toHaveBeenCalledWith(
      APP_MENU_COMMAND_EVENT,
      expect.any(Function),
      { target: "main" },
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
