import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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

export function listenForAppMenuCommand(
  handler: (command: AppMenuCommand) => void,
): Promise<UnlistenFn> {
  if (!("__TAURI_INTERNALS__" in globalThis)) {
    return Promise.resolve(() => undefined);
  }

  return listen<AppMenuCommand>(APP_MENU_COMMAND_EVENT, (event) => {
    handler(event.payload);
  });
}
