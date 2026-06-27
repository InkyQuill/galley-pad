import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const APP_MENU_COMMAND_EVENT = "app-menu-command";

export type AppMenuCommand =
  | "new"
  | "open"
  | "save"
  | "save-as"
  | "settings"
  | "toggle-toolbar";

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
