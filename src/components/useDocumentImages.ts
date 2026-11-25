import { useEffect, useMemo, useReducer } from "react";
import type { GalleyImageInfo } from "@inkyquill/galley-editor";
import { relativeDocumentReference, resolveDocumentReference, watchDocumentImages } from "../tauri/documentAssets";

export function useDocumentImages(documentPath: string | null, allowRemoteImages: boolean, active = true) {
  const [revision, refresh] = useReducer((n: number) => n + 1, 0);
  const [resolved, notify] = useReducer((n: number) => n + 1, 0);
  // A retained tab can miss file events while inactive. Give each activation
  // and filesystem refresh its own asset URLs, including after reopening a tab.
  const { sources, version } = useMemo(() => ({
    sources: new Map<string, string | null>(),
    version: crypto.randomUUID(),
  }), [documentPath, revision, active]);
  const paths = useMemo(() => [...sources.keys()].map(relativeDocumentReference).filter((p): p is string => !!p).sort(), [sources, resolved]);
  const list = JSON.stringify(paths);

  useEffect(() => {
    if (!documentPath || !active || list === "[]") return;
    let disposed = false;
    let timer: number | undefined;
    let unlisten: (() => void) | undefined;
    const changed = () => {
      if (disposed) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 80);
    };
    void watchDocumentImages(documentPath, JSON.parse(list) as string[], changed).then(stop => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch(() => {});
    window.addEventListener("focus", changed);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.removeEventListener("focus", changed);
      unlisten?.();
    };
  }, [documentPath, active, list, revision]);

  return useMemo(() => {
    const resolve = ({ url }: GalleyImageInfo) => {
      if (/^data:image\/(?:png|jpeg|gif|webp|avif|bmp|svg\+xml)[;,]/i.test(url)) return undefined;
      if (/^https:\/\//i.test(url)) return allowRemoteImages ? undefined : null;
      if (!active || !documentPath || !relativeDocumentReference(url)) return null;
      if (!sources.has(url)) {
        sources.set(url, null);
        void resolveDocumentReference(documentPath, url, "image").catch(() => null).then(source => {
          sources.set(url, source ? `${source}?v=${version}` : null);
          notify();
        });
      }
      return sources.get(url) ?? null;
    };
    return resolve;
  }, [sources, version, documentPath, allowRemoteImages, active, resolved]);
}
