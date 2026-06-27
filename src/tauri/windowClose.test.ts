import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listenForWindowCloseRequest } from "./windowClose";

const windowMock = vi.hoisted(() => ({
  destroy: vi.fn(),
  onCloseRequested: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => windowMock),
}));

describe("listenForWindowCloseRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    windowMock.destroy.mockResolvedValue(undefined);
    windowMock.onCloseRequested.mockResolvedValue(() => undefined);
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
  });

  it("force destroys the window after close is approved", async () => {
    const handler = vi.fn().mockResolvedValue(true);
    await listenForWindowCloseRequest(handler);
    const closeHandler = windowMock.onCloseRequested.mock.calls[0][0];
    const event = { preventDefault: vi.fn() };

    await closeHandler(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(handler).toHaveBeenCalledOnce();
    expect(windowMock.destroy).toHaveBeenCalledOnce();
  });

  it("keeps later close attempts available after close is cancelled", async () => {
    const handler = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await listenForWindowCloseRequest(handler);
    const closeHandler = windowMock.onCloseRequested.mock.calls[0][0];

    await closeHandler({ preventDefault: vi.fn() });
    await closeHandler({ preventDefault: vi.fn() });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(windowMock.destroy).toHaveBeenCalledOnce();
  });

  it("ignores duplicate close requests while approval is pending", async () => {
    const pendingApproval = deferred<boolean>();
    const handler = vi.fn().mockReturnValue(pendingApproval.promise);
    await listenForWindowCloseRequest(handler);
    const closeHandler = windowMock.onCloseRequested.mock.calls[0][0];

    const firstClose = closeHandler({ preventDefault: vi.fn() });
    await closeHandler({ preventDefault: vi.fn() });

    expect(handler).toHaveBeenCalledOnce();
    expect(windowMock.destroy).not.toHaveBeenCalled();

    pendingApproval.resolve(true);
    await firstClose;

    expect(windowMock.destroy).toHaveBeenCalledOnce();
  });

  it("does not register a listener outside Tauri", async () => {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

    const unlisten = await listenForWindowCloseRequest(vi.fn());

    expect(getCurrentWindow).not.toHaveBeenCalled();
    expect(windowMock.onCloseRequested).not.toHaveBeenCalled();
    expect(unlisten()).toBeUndefined();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}
