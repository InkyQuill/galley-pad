export const DEFAULT_WORD_WRAP = true;

export function normalizeWordWrap(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_WORD_WRAP;
}
