import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const MARKDOWN_FILE_OPENED_EVENT = "markdown-file-opened";

export function getPendingMarkdownFileOpens(): Promise<string[]> {
  if (!isTauriRuntime()) {
    return Promise.resolve([]);
  }

  return invoke<string[]>("take_pending_markdown_file_opens");
}

export function getWindowMarkdownFileOpen(): string | null {
  const path = new URLSearchParams(globalThis.location.search).get("open");

  return path && path.trim() ? path : null;
}

export function listenForMarkdownFileOpen(
  handler: (path: string) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return Promise.resolve(() => undefined);
  }

  return listen<string>(MARKDOWN_FILE_OPENED_EVENT, (event) => {
    handler(event.payload);
  });
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in globalThis;
}
