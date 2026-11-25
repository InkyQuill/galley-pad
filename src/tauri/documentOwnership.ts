import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in globalThis;
}

export function claimDocumentPath(path: string, tabId: string): Promise<string | null> {
  if (!isTauriRuntime()) return Promise.resolve(path);
  return invoke("claim_document_path", { path, tabId });
}

export function releaseDocumentTab(tabId: string): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke("release_document_tab", { tabId });
}

export function listenForDocumentActivation(handler: (tabId: string) => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return Promise.resolve(() => undefined);
  return listen<string>("activate-document-tab", ({ payload }) => handler(payload));
}
