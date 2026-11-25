import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

export function relativeDocumentReference(reference: string): string | null {
  const path = reference.split(/[?#]/, 1)[0];
  try {
    const decoded = decodeURIComponent(path);
    // eslint-disable-next-line no-control-regex -- Decoded paths must not contain control characters.
    if (!decoded || /[:\\\u0000-\u001f]/.test(decoded) || decoded.startsWith("/")) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function resolveDocumentReference(
  documentPath: string,
  reference: string,
  kind: "image" | "document",
): Promise<string | null> {
  const relativePath = relativeDocumentReference(reference);
  if (!relativePath || !isTauri()) return Promise.resolve(null);

  return invoke<string | null>("resolve_document_reference", {
    documentPath,
    relativePath,
    kind,
  }).then((path) => path && kind === "image" ? convertFileSrc(path) : path);
}

export async function openEditorUrl(url: string): Promise<boolean> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (!["https:", "http:", "mailto:"].includes(target.protocol)) return false;

  if (isTauri()) {
    await openUrl(target.href);
  } else {
    window.open(target.href, "_blank", "noopener,noreferrer");
  }
  return true;
}
