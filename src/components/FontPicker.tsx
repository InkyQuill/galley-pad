import { TbSearch } from "react-icons/tb";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  SYSTEM_EDITOR_FONT_FAMILY,
  editorFontCssValue,
} from "../settings/appearance";
import type { SystemFont } from "../tauri/systemFonts";

type FontPickerProps = {
  value: string;
  fonts: SystemFont[];
  previewText: string;
  loading?: boolean;
  onChange: (family: string) => void;
};

const OPTION_HEIGHT = 52;
const OVERSCAN = 3;

const defaultPreviewText = "Aa Bb Cc 0123456789 The quick brown fox";

export function FontPicker({
  value,
  fonts,
  previewText,
  loading = false,
  onChange,
}: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [scrollTop, setScrollTop] = useState(0);
  const [listHeight, setListHeight] = useState(360);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const listboxId = useId();
  const searchId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sampleText = previewText || defaultPreviewText;
  const selectedLabel =
    value === SYSTEM_EDITOR_FONT_FAMILY ? "System default" : value;
  const selectedCssValue = editorFontCssValue(value);
  const filteredFonts = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) {
      return fonts;
    }

    return fonts.filter((font) =>
      normalizeSearch(font.family).includes(normalizedQuery),
    );
  }, [fonts, query]);
  const choices = useMemo(() => [
    { family: SYSTEM_EDITOR_FONT_FAMILY, label: "System default" },
    ...filteredFonts.map(({ family }) => ({ family, label: family })),
  ], [filteredFonts]);
  const start = Math.max(0, Math.floor(scrollTop / OPTION_HEIGHT) - OVERSCAN);
  const end = Math.min(choices.length, Math.ceil((scrollTop + listHeight) / OPTION_HEIGHT) + OVERSCAN);
  const portalRoot = rootRef.current?.closest("dialog") ?? document.body;

  function selectFont(family: string) {
    onChange(family);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function togglePicker() {
    if (!open) {
      setQuery("");
      setActiveIndex(-1);
      setScrollTop(0);
    }
    setOpen(!open);
  }

  function activate(index: number) {
    const next = Math.max(0, Math.min(index, choices.length - 1));
    setActiveIndex(next);
    const list = listRef.current;
    if (!list) return;

    const top = next * OPTION_HEIGHT;
    const bottom = top + OPTION_HEIGHT;
    if (top < list.scrollTop) {
      list.scrollTop = top;
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
    setScrollTop(list.scrollTop);
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        activate(activeIndex + 1);
        break;
      case "ArrowUp":
        activate(activeIndex < 0 ? choices.length - 1 : activeIndex - 1);
        break;
      case "Enter":
        if (activeIndex < 0 || !choices[activeIndex]) return;
        selectFont(choices[activeIndex].family);
        break;
      case "Escape":
        setOpen(false);
        triggerRef.current?.focus();
        break;
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;

    function measure() {
      if (list?.clientHeight) setListHeight(list.clientHeight);
    }

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const dialog = rootRef.current?.closest("dialog");
      const containerRect = dialog?.getBoundingClientRect();
      const viewportPadding = 12;
      const availableWidth = window.innerWidth - viewportPadding * 2;
      const width = Math.min(560, availableWidth);
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        window.innerWidth - width - viewportPadding,
      );
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const placeAbove = spaceBelow < 280 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(
        0,
        Math.min(420, placeAbove ? spaceAbove - 8 : spaceBelow - 8),
      );

      if (containerRect) {
        setPopoverStyle({
          position: "absolute",
          left: left - containerRect.left,
          top: placeAbove ? undefined : rect.bottom - containerRect.top + 6,
          bottom: placeAbove ? containerRect.bottom - rect.top + 6 : undefined,
          width,
          maxHeight,
        });
      } else {
        setPopoverStyle({
          position: "fixed",
          left,
          top: placeAbove ? undefined : rect.bottom + 6,
          bottom: placeAbove ? window.innerHeight - rect.top + 6 : undefined,
          width,
          maxHeight,
        });
      }
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        rootRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }

      setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="font-picker"
      data-open={open ? "true" : "false"}
    >
      <button
        ref={triggerRef}
        type="button"
        className="font-picker__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={togglePicker}
      >
        <span className="font-picker__trigger-label">{selectedLabel}</span>
        <span
          className="font-picker__trigger-preview"
          style={{ fontFamily: selectedCssValue }}
        >
          {sampleText}
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              className="font-picker__popover"
              style={popoverStyle}
            >
              <label className="font-picker__search" htmlFor={searchId}>
                <TbSearch aria-hidden="true" size={14} />
                <input
                  id={searchId}
                  type="search"
                  role="combobox"
                  aria-label="Search fonts"
                  aria-expanded="true"
                  aria-autocomplete="list"
                  aria-controls={listboxId}
                  aria-activedescendant={activeIndex >= start && activeIndex < end ? `${listboxId}-${activeIndex}` : undefined}
                  value={query}
                  autoFocus
                  placeholder="Search fonts"
                  onKeyDown={handleSearchKeyDown}
                  onBlur={(event) => {
                    if (event.relatedTarget !== triggerRef.current) setOpen(false);
                  }}
                  onChange={(event) => {
                    setQuery(event.currentTarget.value);
                    setActiveIndex(-1);
                    if (listRef.current) listRef.current.scrollTop = 0;
                    setScrollTop(0);
                  }}
                />
              </label>
              <div
                id={listboxId}
                ref={listRef}
                className="font-picker__list"
                role="listbox"
                aria-label="Editor font family"
                onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
              >
                <div className="font-picker__virtual-list" role="presentation" style={{ height: choices.length * OPTION_HEIGHT }}>
                  {choices.slice(start, end).map(({ family, label }, visibleIndex) => {
                    const index = start + visibleIndex;
                    return (
                      <FontOption
                        key={family}
                        id={`${listboxId}-${index}`}
                        index={index}
                        count={choices.length}
                        family={family}
                        label={label}
                        previewText={sampleText}
                        selected={value === family}
                        active={index === activeIndex}
                        onSelect={selectFont}
                      />
                    );
                  })}
                </div>
                {!loading && filteredFonts.length === 0 ? (
                  <div className="font-picker__empty">No fonts found</div>
                ) : null}
                {loading ? (
                  <div className="font-picker__empty">Loading fonts...</div>
                ) : null}
              </div>
            </div>,
            portalRoot,
          )
        : null}
    </div>
  );
}

type FontOptionProps = {
  family: string;
  label: string;
  id: string;
  index: number;
  count: number;
  previewText: string;
  selected: boolean;
  active: boolean;
  onSelect: (family: string) => void;
};

function FontOption({
  family,
  label,
  id,
  index,
  count,
  previewText,
  selected,
  active,
  onSelect,
}: FontOptionProps) {
  return (
    <button
      id={id}
      type="button"
      className="font-picker__option"
      role="option"
      tabIndex={-1}
      aria-label={label}
      aria-selected={selected}
      aria-posinset={index + 1}
      aria-setsize={count}
      data-active={active || undefined}
      style={{ top: index * OPTION_HEIGHT, height: OPTION_HEIGHT }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(family)}
    >
      <span className="font-picker__option-name">{label}</span>
      <span
        className="font-picker__option-preview"
        style={{ fontFamily: editorFontCssValue(family) }}
      >
        {previewText}
      </span>
    </button>
  );
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}
