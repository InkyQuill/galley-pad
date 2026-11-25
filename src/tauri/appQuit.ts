import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type QuitHandlers = {
  confirm: () => Promise<boolean>;
  clear: () => Promise<void>;
  cancelled: () => void;
  onError: (error: unknown) => void;
};

export async function listenForAppQuit(handlers: QuitHandlers): Promise<UnlistenFn> {
  if (!("__TAURI_INTERNALS__" in globalThis)) return () => undefined;
  let activeId: number | undefined;
  const unlisten = await Promise.all([
    listen<number>("app-quit-check", async ({ payload: requestId }) => {
      if (activeId !== undefined) return;
      activeId = requestId;
      let approved = false;
      try {
        approved = await handlers.confirm();
      } catch (error) {
        handlers.onError(error);
      }
      void invoke("answer_app_quit_check", { requestId, approved }).catch(handlers.onError);
    }),
    listen<number>("app-quit-clear", async ({ payload: requestId }) => {
      if (requestId !== activeId) return;
      try {
        await handlers.clear();
      } catch (error) {
        handlers.onError(error);
      } finally {
        void invoke("finish_app_quit_clear", { requestId }).catch(handlers.onError);
      }
    }),
    listen<number>("app-quit-cancelled", ({ payload: requestId }) => {
      if (requestId !== activeId) return;
      activeId = undefined;
      handlers.cancelled();
    }),
  ]);
  return () => unlisten.forEach((remove) => remove());
}
