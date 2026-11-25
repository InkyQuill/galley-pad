import { listenForCurrentWindow } from "./windowEvents";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";

type QuitHandlers = {
  confirm: (signal?: AbortSignal) => Promise<boolean>;
  clear: () => Promise<void>;
  cancelled: () => void;
  onError: (error: unknown) => void;
};

export async function listenForAppQuit(handlers: QuitHandlers): Promise<UnlistenFn> {
  if (!("__TAURI_INTERNALS__" in globalThis)) return () => undefined;
  let activeId: number | undefined;
  let confirmation: AbortController | undefined;
  const unlisten = await Promise.all([
    listenForCurrentWindow<number>("app-quit-check", async ({ payload: requestId }) => {
      if (activeId !== undefined) return;
      activeId = requestId;
      const abort = new AbortController();
      confirmation = abort;
      let approved = false;
      try {
        approved = await handlers.confirm(abort.signal);
      } catch (error) {
        handlers.onError(error);
      }
      if (!abort.signal.aborted) {
        void invoke("answer_app_quit_check", { requestId, approved }).catch(handlers.onError);
      }
    }),
    listenForCurrentWindow<number>("app-quit-clear", async ({ payload: requestId }) => {
      if (requestId !== activeId) return;
      try {
        await handlers.clear();
      } catch (error) {
        handlers.onError(error);
      } finally {
        void invoke("finish_app_quit_clear", { requestId }).catch(handlers.onError);
      }
    }),
    listenForCurrentWindow<number>("app-quit-cancelled", ({ payload: requestId }) => {
      if (requestId !== activeId) return;
      activeId = undefined;
      confirmation?.abort();
      confirmation = undefined;
      handlers.cancelled();
    }),
  ]);
  try {
    await invoke("register_app_quit_window");
  } catch (error) {
    unlisten.forEach((remove) => remove());
    throw error;
  }
  return () => {
    confirmation?.abort();
    unlisten.forEach((remove) => remove());
  };
}
