import { invoke, isTauri } from "@tauri-apps/api/core";

export function syncWordWrapMenuChecked(checked: boolean): Promise<void> {
  if (!isTauri()) {
    return Promise.resolve();
  }

  return invoke("set_word_wrap_menu_checked", { checked });
}
