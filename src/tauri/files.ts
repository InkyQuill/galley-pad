import { invoke } from "@tauri-apps/api/core";
import type { FileReadResult, FileWriteResult } from "../document/session";

export function readTextFile(path: string): Promise<FileReadResult> {
  return invoke<FileReadResult>("read_text_file", { path });
}

export function writeTextFile(
  path: string,
  content: string,
): Promise<FileWriteResult> {
  return invoke<FileWriteResult>("write_text_file", { path, content });
}
