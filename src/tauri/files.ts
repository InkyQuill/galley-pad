import { invoke } from "@tauri-apps/api/core";
import { UnsupportedFileEncodingError } from "../document/lifecycle";
import type { FileReadResult, FileWriteOptions, FileWriteResult } from "../document/session";

export async function readTextFile(
  path: string,
  encoding?: "windows1251",
): Promise<FileReadResult> {
  try {
    return await invoke<FileReadResult>("read_text_file", {
      path,
      ...(encoding ? { encoding } : {}),
    });
  } catch (error) {
    if (
      typeof error === "object" && error !== null &&
      "message" in error && typeof error.message === "string"
    ) {
      if ("kind" in error && error.kind === "unsupportedEncoding") {
        throw new UnsupportedFileEncodingError(path, error.message);
      }
      throw error instanceof Error ? error : new Error(error.message);
    }
    throw error;
  }
}

export function writeTextFile(
  path: string,
  content: string,
  options?: FileWriteOptions,
): Promise<FileWriteResult> {
  const { tabId, ...writeOptions } = options ?? {};
  return invoke<FileWriteResult>("write_text_file", {
    path,
    content,
    ...(options ? { options: writeOptions } : {}),
    ...(tabId ? { tabId } : {}),
  });
}
