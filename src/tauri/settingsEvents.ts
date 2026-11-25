import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { RawPersistedAppSettings } from "./appPersistence";

export function listenForAppSettingsUpdates(
  handler: (patch: RawPersistedAppSettings) => void,
): Promise<UnlistenFn> {
  if (!("__TAURI_INTERNALS__" in globalThis)) return Promise.resolve(() => undefined);
  return listen<RawPersistedAppSettings>("app-settings-updated", ({ payload }) => handler(payload));
}
