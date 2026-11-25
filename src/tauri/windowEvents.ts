import { listen, type EventCallback } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function listenForCurrentWindow<T>(event: string, handler: EventCallback<T>) {
  return listen(event, handler, { target: getCurrentWindow().label });
}
