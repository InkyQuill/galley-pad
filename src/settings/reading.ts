export const EDITOR_LINE_WIDTHS = [0, 72, 88, 104] as const;

export type EditorLineWidth = (typeof EDITOR_LINE_WIDTHS)[number];

export function normalizeEditorLineWidth(value: unknown): EditorLineWidth {
  return EDITOR_LINE_WIDTHS.find((width) => width === value) ?? 0;
}
