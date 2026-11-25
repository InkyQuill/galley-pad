import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function openMarkdownFileWindow(path: string, allowMissing = false, fragment?: string): Promise<string | null> {
  if (!("__TAURI_INTERNALS__" in globalThis)) {
    return Promise.resolve(null);
  }

  return invoke<string>("open_markdown_file_window", { path, ...(allowMissing && { allowMissing }), ...(fragment && { fragment }) });
}

export function openDraftWindow(): Promise<string | null> {
  if (!("__TAURI_INTERNALS__" in globalThis)) return Promise.resolve(null);
  return invoke<string>("open_draft_window");
}

export function setCurrentWindowTitle(title: string): Promise<void> {
  if (!("__TAURI_INTERNALS__" in globalThis)) return Promise.resolve();
  return getCurrentWindow().setTitle(title);
}
