import { Search } from "lucide-react";
import {
  type CSSProperties,
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
  SYSTEM_EDITOR_FONT_STACK,
  editorFontCssValue,
  quoteCssFontFamily,
} from "../settings/appearance";
import type { SystemFont } from "../tauri/systemFonts";

type FontPickerProps = {
  value: string;
  fonts: SystemFont[];
  previewText: string;
  loading?: boolean;
  onChange: (family: string) => void;
};

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
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const listboxId = useId();
  const searchId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
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
  const portalRoot = rootRef.current?.closest("dialog") ?? document.body;

  function selectFont(family: string) {
    onChange(family);
    setOpen(false);
    setQuery("");
  }

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
        220,
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

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
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
        aria-controls={listboxId}
        onClick={() => setOpen((current) => !current)}
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
                <Search aria-hidden="true" size={14} />
                <input
                  id={searchId}
                  type="search"
                  aria-label="Search fonts"
                  value={query}
                  autoFocus
                  placeholder="Search fonts"
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
              </label>
              <div
                id={listboxId}
                className="font-picker__list"
                role="listbox"
                aria-label="Editor font family"
              >
                <FontOption
                  family={SYSTEM_EDITOR_FONT_FAMILY}
                  label="System default"
                  cssValue={SYSTEM_EDITOR_FONT_STACK}
                  previewText={sampleText}
                  selected={value === SYSTEM_EDITOR_FONT_FAMILY}
                  onSelect={selectFont}
                />
                {filteredFonts.map((font) => (
                  <FontOption
                    key={font.family}
                    family={font.family}
                    label={font.family}
                    cssValue={
                      font.cssValue ||
                      `${quoteCssFontFamily(font.family)}, sans-serif`
                    }
                    previewText={sampleText}
                    selected={value === font.family}
                    onSelect={selectFont}
                  />
                ))}
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
  cssValue: string;
  previewText: string;
  selected: boolean;
  onSelect: (family: string) => void;
};

function FontOption({
  family,
  label,
  cssValue,
  previewText,
  selected,
  onSelect,
}: FontOptionProps) {
  return (
    <button
      type="button"
      className="font-picker__option"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(family)}
    >
      <span className="font-picker__option-name">{label}</span>
      <span
        className="font-picker__option-preview"
        style={{ fontFamily: cssValue }}
      >
        {previewText}
      </span>
    </button>
  );
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}
