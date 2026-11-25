import {
  forwardRef,
  useImperativeHandle,
  type CSSProperties,
  type ReactNode,
} from "react";
import { vi } from "vitest";
import editorPackage from "@inkyquill/galley-editor/package.json";

const editorCredit = `Galley Editor v${editorPackage.version} by Inky Quill`;

type TableControlIconRenderer = ({
  label,
}: {
  label: string;
}) => HTMLElement | null;

export const mockGalleyOpenSearch = vi.fn(() => true);
export const mockGalleyFocus = vi.fn();
export const mockGalleyRevealPosition = vi.fn();
export const mockGalleyGetHeadings = vi.fn((): Array<{
  from: number; to: number; level: number; text: string; slug: string;
}> => []);
export const mockGalleyHandleState = { ready: true };

export const GalleyEditor = forwardRef(function MockGalleyEditor(
  {
    value,
    onChange,
    docKey,
    ariaLabel,
    mode = "live",
    spellcheck = false,
    toolbar = true,
    footer = true,
    layout = "autosize",
    theme = "auto",
    surface,
    tableControlIcons,
    horizontalScroll = false,
  }: {
    value: string;
    onChange: (content: string) => void;
    docKey?: string | number;
    ariaLabel?: string;
    mode?: string;
    spellcheck?: boolean;
    toolbar?: boolean | { icons?: Record<string, unknown> };
    tableControlIcons?: Record<string, TableControlIconRenderer>;
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
    horizontalScroll?: boolean;
  },
  ref,
) {
  useImperativeHandle(ref, () =>
    mockGalleyHandleState.ready
      ? {
          openSearch: mockGalleyOpenSearch,
          focus: mockGalleyFocus,
          getHeadings: mockGalleyGetHeadings,
          getViewport: () => ({ from: 0, to: value.length }),
          revealPosition: mockGalleyRevealPosition,
        }
      : null,
  );
  const iconCount =
    typeof toolbar === "object" ? Object.keys(toolbar.icons ?? {}).length : 0;
  const tableControlIconEntries = Object.entries(tableControlIcons ?? {});
  const tableControlIconCount = tableControlIconEntries.length;
  const tableControlIconSamples =
    toolbar && tableControlIconEntries.length > 0
      ? tableControlIconEntries.flatMap(([name, renderIcon]) => {
          const first = renderIcon({ label: `${name} first` });
          const second = renderIcon({ label: `${name} second` });

          return [
            {
              className: first?.getAttribute("class") ?? "",
              distinct: first !== second,
              name,
              title: first?.getAttribute("title") ?? "",
            },
            {
              className: second?.getAttribute("class") ?? "",
              distinct: first !== second,
              name,
              title: second?.getAttribute("title") ?? "",
            },
          ];
        })
      : [];
  const footerOptions = typeof footer === "object" ? footer : {};
  const words = value.trim().match(/\S+/g)?.length ?? 0;

  return (
    <div
      data-testid="mock-galley-editor-shell"
      data-doc-key={docKey}
      data-mode={mode}
      data-spellcheck={String(spellcheck)}
      data-editor-aria-label={ariaLabel}
      data-layout={layout}
      data-theme={theme}
      data-horizontal-scroll={String(horizontalScroll)}
      className={surface?.className}
      style={surface?.style}
    >
      {toolbar ? (
        <div role="toolbar" aria-label="Mock Galley Toolbar">
          <span aria-label="Mock toolbar icon count">{iconCount}</span>
          <span aria-label="Mock table control icon count">
            {tableControlIconCount}
          </span>
          {tableControlIconSamples.map((sample, index) => (
            <span
              aria-label={`Mock table control icon ${index}`}
              data-class-name={sample.className}
              data-distinct={String(sample.distinct)}
              data-name={sample.name}
              data-title={sample.title}
              key={`${sample.name}-${index}`}
            />
          ))}
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
              aria-label={editorCredit}
            >
              <svg
                className="ge-footer-logo"
                aria-hidden="true"
                focusable="false"
              />
              <span className="ge-footer-tooltip" role="tooltip">
                {editorCredit}
              </span>
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
});
