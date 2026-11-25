import { invoke, isTauri } from "@tauri-apps/api/core";

export function syncWordWrapMenuChecked(checked: boolean): Promise<void> {
  if (!isTauri()) {
    return Promise.resolve();
  }

  return invoke("set_word_wrap_menu_checked", { checked });
}

export function setFileMenuBusy(busy: boolean): Promise<void> {
  if (!("__TAURI_INTERNALS__" in globalThis)) return Promise.resolve();
  return invoke("set_file_menu_busy", { busy });
}
