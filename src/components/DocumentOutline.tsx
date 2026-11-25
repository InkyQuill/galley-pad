import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { TbX } from "react-icons/tb";
import type { GalleyHeading, GalleyViewport } from "@inkyquill/galley-editor";

export function headingAtPosition(
  headings: readonly GalleyHeading[],
  position: number,
): number {
  let start = 0;
  let end = headings.length;
  while (start < end) {
    const middle = (start + end) >>> 1;
    if (headings[middle].from <= position) {
      start = middle + 1;
    } else {
      end = middle;
    }
  }
  return start - 1;
}

export function outlinePositionAtViewport(
  content: string,
  headings: readonly GalleyHeading[],
  viewport: GalleyViewport,
): number {
  if (viewport.from > 0 && viewport.to === content.length) return viewport.to;

  const next = headings[headingAtPosition(headings, viewport.from) + 1];
  if (next && next.from < viewport.to) {
    const prefix = content.slice(viewport.from, next.from);
    // A start-aligned jump can leave the preceding blank line partly visible.
    if (/^[\t ]*(?:\r?\n[\t ]*)?$/.test(prefix)) return next.from;
  }
  return viewport.from;
}

export function DocumentOutline({
  id,
  headings,
  viewportStart,
  onNavigate,
  onClose,
}: {
  id: string;
  headings: readonly GalleyHeading[];
  viewportStart: number;
  onNavigate: (position: number) => void;
  onClose: () => void;
}) {
  const current = headingAtPosition(headings, viewportStart);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const tabStop = focusedIndex === null
    ? Math.max(0, current)
    : Math.min(focusedIndex, headings.length - 1);

  useEffect(() => {
    const item = items.current[current];
    if (!item?.closest("nav")?.contains(document.activeElement)) {
      item?.scrollIntoView?.({ block: "nearest" });
    }
  }, [current]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    const index = items.current.findIndex((item) => item === document.activeElement);
    if (index < 0) return;

    let next: number;
    switch (event.key) {
      case "ArrowUp": next = Math.max(0, index - 1); break;
      case "ArrowDown": next = Math.min(headings.length - 1, index + 1); break;
      case "Home": next = 0; break;
      case "End": next = headings.length - 1; break;
      default: return;
    }

    event.preventDefault();
    items.current[next]?.focus();
  }

  return (
    <nav
      id={id}
      className="document-outline"
      aria-labelledby={`${id}-title`}
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusedIndex(null);
      }}
    >
      <div className="document-outline-header">
        <h2 id={`${id}-title`}>Table of contents</h2>
        <button type="button" aria-label="Close table of contents" onClick={onClose}>
          <TbX size={16} aria-hidden="true" />
        </button>
      </div>
      {headings.length > 0 ? (
        <ul className="document-outline-list">
          {headings.map((heading, index) => (
            <li key={heading.from} style={{ paddingInlineStart: `${(heading.level - 1) * 12}px` }}>
              <button
                ref={(item) => { items.current[index] = item; }}
                type="button"
                tabIndex={index === tabStop ? 0 : -1}
                aria-current={index === current ? "location" : undefined}
                onFocus={() => setFocusedIndex(index)}
                onClick={() => onNavigate(heading.from)}
              >
                {heading.text || `Untitled heading (level ${heading.level})`}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="document-outline-empty">No headings in this document.</p>
      )}
    </nav>
  );
}
