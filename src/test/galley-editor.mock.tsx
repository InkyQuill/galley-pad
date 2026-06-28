import type { CSSProperties, ReactNode } from "react";

export function GalleyEditor({
  value,
  onChange,
  toolbar = true,
  footer = true,
  layout = "autosize",
  theme = "auto",
  surface,
}: {
  value: string;
  onChange: (content: string) => void;
  toolbar?: boolean | { icons?: Record<string, unknown> };
  footer?:
    | boolean
    | {
        before?: ReactNode;
        after?: (context: {
          wordCount: number;
          characterCount: number;
        }) => ReactNode;
        wordCount?: boolean;
        characterCount?: boolean;
        logo?: boolean;
      };
  layout?: string;
  theme?: string;
  surface?: {
    className?: string;
    style?: CSSProperties;
  };
}) {
  const iconCount =
    typeof toolbar === "object" ? Object.keys(toolbar.icons ?? {}).length : 0;
  const footerOptions = typeof footer === "object" ? footer : {};
  const words = value.trim().match(/\S+/g)?.length ?? 0;

  return (
    <div
      data-testid="mock-galley-editor-shell"
      data-layout={layout}
      data-theme={theme}
      className={surface?.className}
      style={surface?.style}
    >
      {toolbar ? (
        <div role="toolbar" aria-label="Mock Galley Toolbar">
          <span aria-label="Mock toolbar icon count">{iconCount}</span>
        </div>
      ) : null}
      <textarea
        aria-label="Mock Galley Editor"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {footer ? (
        <div aria-label="Mock Galley Footer">
          {footerOptions.before}
          <span>
            {footerOptions.wordCount === false
              ? null
              : `${words} ${words === 1 ? "word" : "words"}`}
          </span>
          <span>
            {footerOptions.characterCount === false
              ? null
              : `${value.length} ${
                  value.length === 1 ? "character" : "characters"
                }`}
          </span>
          {footerOptions.after?.({
            wordCount: words,
            characterCount: value.length,
          })}
          {footerOptions.logo === false ? null : (
            <span
              className="ge-footer-logo-wrap"
              aria-label="Galley Editor v.0.10.0 by Inky Quill"
            >
              <svg
                className="ge-footer-logo"
                aria-hidden="true"
                focusable="false"
              />
              <span className="ge-footer-tooltip" role="tooltip">
                Galley Editor v.0.10.0 by Inky Quill
              </span>
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
