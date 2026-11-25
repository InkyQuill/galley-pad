import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in globalThis;
}

export function readRecentFiles(): Promise<string[]> {
  return isTauriRuntime() ? invoke("read_recent_files") : Promise.resolve([]);
}

export function updateRecentFile(path: string, remember: boolean): Promise<void> {
  return isTauriRuntime() ? invoke("update_recent_file", { path, remember }) : Promise.resolve();
}

export function listenForMarkdownDrop(handler: (paths: string[]) => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return Promise.resolve(() => undefined);
  return getCurrentWebview().onDragDropEvent(({ payload }) => {
    if (payload.type !== "drop") return;
    const markdown = payload.paths.filter((path) => /\.(?:md|markdown)$/i.test(path));
    if (markdown.length) handler(markdown);
  });
}

export function setActiveDocumentWatch(path: string | null): Promise<void> {
  return isTauriRuntime() ? invoke("watch_active_document", { path }) : Promise.resolve();
}

export function listenForActiveDocumentChanges(handler: (path: string) => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return Promise.resolve(() => undefined);
  return listen<string>("active-document-changed", ({ payload }) => handler(payload));
}
