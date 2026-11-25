import { listenForCurrentWindow } from "./windowEvents";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in globalThis;
}

export function claimDocumentPath(path: string, tabId: string, fragment?: string): Promise<string | { path: string; fragment: string } | null> {
  if (!isTauriRuntime()) return Promise.resolve(path);
  return invoke("claim_document_path", { path, tabId, ...(fragment && {fragment}) });
}

export function releaseDocumentTab(tabId: string): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke("release_document_tab", { tabId });
}

export function listenForDocumentActivation(handler: (tabId: string, fragment?: string) => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return Promise.resolve(() => undefined);
  return listenForCurrentWindow<string | { tabId: string; fragment: string }>("activate-document-tab", ({ payload }) =>
    typeof payload === "string" ? handler(payload) : handler(payload.tabId, payload.fragment),
  );
}
