import { invoke } from "@tauri-apps/api/core";

export function openMarkdownFileWindow(path: string): Promise<string | null> {
  if (!("__TAURI_INTERNALS__" in globalThis)) {
    return Promise.resolve(null);
  }

  return invoke<string>("open_markdown_file_window", { path });
}
