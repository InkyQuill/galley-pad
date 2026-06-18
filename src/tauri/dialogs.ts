import { open, save } from "@tauri-apps/plugin-dialog";

const openFilters = [
  {
    name: "Markdown and text",
    extensions: ["md", "markdown", "txt"],
  },
];

const saveFilters = [
  {
    name: "Markdown",
    extensions: ["md", "markdown"],
  },
  {
    name: "Text",
    extensions: ["txt"],
  },
];

export async function pickOpenFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: openFilters,
  });

  return typeof selected === "string" ? selected : null;
}

export async function pickSaveFile(
  defaultPath: string | null,
): Promise<string | null> {
  const options =
    defaultPath && defaultPath.trim()
      ? { defaultPath, filters: saveFilters }
      : { filters: saveFilters };

  return save(options);
}
