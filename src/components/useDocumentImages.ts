import { useCallback, useRef, useState } from "react";
import type { GalleyImageInfo } from "@inkyquill/galley-editor";
import {
  relativeDocumentReference,
  resolveDocumentReference,
} from "../tauri/documentAssets";

export function useDocumentImages(
  documentPath: string | null,
  allowRemoteImages: boolean,
) {
  const pending = useRef(new Set<string>());
  const [sources, setSources] = useState<ReadonlyMap<string, string | null>>(
    () => new Map(),
  );

  return useCallback(({ url }: GalleyImageInfo) => {
    if (/^data:image\/(?:png|jpeg|gif|webp|avif|bmp|svg\+xml)[;,]/i.test(url)) {
      return undefined;
    }
    if (/^https:\/\//i.test(url)) return allowRemoteImages ? undefined : null;
    if (!documentPath || !relativeDocumentReference(url)) return null;

    const key = `${documentPath}\0${url}`;
    if (sources.has(key)) return sources.get(key) ?? null;
    if (!pending.current.has(key)) {
      pending.current.add(key);
      void resolveDocumentReference(documentPath, url, "image")
        .catch(() => null)
        .then((source) => {
          setSources((previous) => new Map(previous).set(key, source));
        })
        .finally(() => pending.current.delete(key));
    }

    return null;
  }, [documentPath, allowRemoteImages, sources]);
}
