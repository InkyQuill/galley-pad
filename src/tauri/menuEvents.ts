import { listenForCurrentWindow } from "./windowEvents";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";

export const APP_MENU_COMMAND_EVENT = "app-menu-command";

export type AppMenuCommand =
  | "new"
  | "close"
  | "open"
  | "open-recent"
  | "mode-live"
  | "mode-markdown"
  | "mode-preview"
  | "save"
  | "save-as"
  | "find"
  | "settings"
  | "toggle-toolbar"
  | "toggle-outline"
  | "toggle-word-wrap";

export async function listenForAppMenuCommand(
  handler: (command: AppMenuCommand, replaying?: true) => void,
): Promise<UnlistenFn> {
  if (!("__TAURI_INTERNALS__" in globalThis)) return () => undefined;

  let disposed = false;
  let drain = Promise.resolve();
  const takeCommands = () => {
    const read = async () => {
      const pending = await invoke<AppMenuCommand[]>("take_pending_menu_commands");
      if (!disposed) pending?.forEach((command) => handler(command, true));
    };
    drain = drain.then(read, read);
    return drain;
  };
  const unlisten = await listenForCurrentWindow<AppMenuCommand | null>(APP_MENU_COMMAND_EVENT, (event) => {
    if (event.payload === null) {
      void takeCommands().catch((error: unknown) => console.error("Could not read pending Galley Pad menu commands", error));
    } else {
      handler(event.payload);
    }
  });

  try {
    await takeCommands();
  } catch (error) {
    unlisten();
    throw error;
  }
  return () => {
    disposed = true;
    unlisten();
  };
}
