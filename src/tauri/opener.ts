import { openUrl } from "@tauri-apps/plugin-opener";

export function openReleasePage(url: string): Promise<void> {
  return openUrl(url);
}
