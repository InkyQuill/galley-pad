import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";

export function closeCurrentWindow(): void {
  if (!("__TAURI_INTERNALS__" in globalThis)) {
    return;
  }

  window.setTimeout(() => {
    void getCurrentWindow().destroy().catch((error: unknown) => {
      console.error("Failed to close Galley Pad window", error);
    });
  }, 0);
}

export function listenForWindowCloseRequest(
  handler: () => Promise<boolean>,
): Promise<UnlistenFn> {
  if (!("__TAURI_INTERNALS__" in globalThis)) {
    return Promise.resolve(() => undefined);
  }

  let approved = false;
  let inFlight = false;
  return getCurrentWindow().onCloseRequested(async (event) => {
    if (approved) {
      return;
    }

    event.preventDefault();
    if (inFlight) {
      return;
    }

    inFlight = true;
    try {
      const canClose = await handler();
      if (canClose) {
        approved = true;
        closeCurrentWindow();
      }
    } finally {
      inFlight = false;
    }
  });
}
