import { invoke } from "@tauri-apps/api/core";

export type SystemFont = {
  family: string;
  cssValue: string;
  monospaced: boolean;
};

export type SystemFontCatalog = {
  fonts: SystemFont[];
  locale: string | null;
  previewText: string;
};

export async function listSystemFonts(): Promise<SystemFontCatalog> {
  return invoke<SystemFontCatalog>("list_system_fonts");
}
