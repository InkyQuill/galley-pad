import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";

export function listenForWindowCloseRequest(
  handler: () => Promise<boolean>,
): Promise<UnlistenFn> {
  if (!("__TAURI_INTERNALS__" in globalThis)) {
    return Promise.resolve(() => undefined);
  }

  let approved = false;
  return getCurrentWindow().onCloseRequested(async (event) => {
    if (approved) {
      return;
    }

    event.preventDefault();
    const canClose = await handler();
    if (canClose) {
      approved = true;
      await getCurrentWindow().destroy();
    }
  });
}
