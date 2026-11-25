import { EditorErrorBoundary } from "./EditorErrorBoundary";
import { DocumentOutline, outlinePositionAtViewport } from "./DocumentOutline";
import { useDocumentImages } from "./useDocumentImages";
import { openEditorUrl, resolveDocumentReference } from "../tauri/documentAssets";
import "./DocumentOutline.css";
import {
  GalleyEditor,
  type GalleyFooterContext,
  type GalleyHandle,
  type GalleyHeading,
  type GalleyMode,
  type GalleyViewport,
  type GalleyTableControlIconName,
  type ToolbarIconName,
} from "@inkyquill/galley-editor";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { tableControlMarkup } from "./tableControlMarkup";
import {
  TbBold,
  TbCode,
  TbCodeblock,
  TbHeading,
  TbLayoutSidebarRight,
  TbListDetails,
  TbLink,
  TbList,
  TbListCheck,
  TbListNumbers,
  TbPhoto,
  TbSeparatorHorizontal,
  TbStrikethrough,
  TbTable,
  TbArrowBackUp,
  TbArrowForwardUp,
  TbItalic,
} from "react-icons/tb";
import type { IconType } from "react-icons";
import { GalleyPadFooterMark } from "./GalleyPadFooterMark";
import { FooterMenuButton } from "./FooterMenuButton";
import { IS_LINUX_DESKTOP } from "../appInfo";
import {
  editorFontStyle,
  type EditorFontSettings,
} from "../settings/appearance";
import type { AppMenuCommand } from "../tauri/menuEvents";

type EditorSurfaceStyle = CSSProperties & Record<`--${string}`, string>;

export type DocumentViewHandle = {
  hasOutline(): boolean;
  revealFragment(fragment: string): boolean;
  openSearch(): boolean;
  focus(): void;
  setMode(mode: GalleyMode): void;
};

export type DocumentViewProps = {
  content: string;
  onContentChange: (content: string) => void;
  documentKey?: string;
  panelId?: string;
  active?: boolean;
  path?: string | null;
  lineWidth?: number;
  spellcheck?: boolean;
  allowRemoteImages?: boolean;
  outlineOpen?: boolean;
  onToggleOutline?: () => void;
  onOpenDocument?: (path: string, fragment?: string) => void;
  onLinkError?: (message: string) => void;
  labelledBy?: string;
  toolbarVisible?: boolean;
  editorScheme?: "auto" | "light" | "dark";
  editorStyle?: EditorSurfaceStyle;
  fontSettings?: EditorFontSettings;
  status?: string;
  wordWrap?: boolean;
  onMenuCommand?: (command: AppMenuCommand) => void;
  updateReleaseUrl?: string;
  onOpenUpdate?: () => void;
};

export const DocumentView = forwardRef<DocumentViewHandle, DocumentViewProps>(
  function DocumentView(
    {
      content,
      onContentChange,
      documentKey,
      panelId,
      active = true,
      path = null,
      lineWidth = 0,
      spellcheck = false,
      allowRemoteImages = false,
      outlineOpen = false,
      onToggleOutline,
      onOpenDocument,
      onLinkError,
      labelledBy,
      toolbarVisible = false,
      editorScheme,
      editorStyle,
      fontSettings = { family: "system", size: "medium" },
      status = "Draft",
      wordWrap = true,
      onMenuCommand,
      updateReleaseUrl,
      onOpenUpdate,
    },
    ref,
  ) {
    const editorRef = useRef<GalleyHandle>(null);
    const linkRouting = useRef({ path, onOpenDocument, onLinkError });
    const outlineId = useId();
    const outlineRef = useRef<HTMLElement>(null);
    useLayoutEffect(() => {
      if (outlineOpen) outlineRef.current?.querySelector<HTMLButtonElement>("li button")?.focus();
    }, [outlineOpen]);
    const [mode, setMode] = useState<GalleyMode>("live");
    const [headings, setHeadings] = useState<readonly GalleyHeading[]>([]);
    const [viewport, setViewport] = useState<GalleyViewport>({ from: 0, to: 0 });
    const resolveImageSource = useDocumentImages(path, allowRemoteImages, active);

    useImperativeHandle(
      ref,
      () => ({
        hasOutline: () => {
          const current = editorRef.current?.getHeadings() ?? [];
          setHeadings(current);
          return current.length >= 2;
        },
        revealFragment: (fragment) => {
          const editor = editorRef.current;
          const heading = editor?.getHeadings().find(item => item.slug === fragment);
          if (!editor || !heading) return false;
          editor.revealPosition(heading.from, { align: "start", select: true, focus: true });
          return true;
        },
        openSearch: () => editorRef.current?.openSearch() ?? false,
        focus: () => editorRef.current?.focus(),
        setMode,
      }),
      [],
    );

    useLayoutEffect(() => {
      if (active) editorRef.current?.focus();
    }, [active]);

    useLayoutEffect(() => {
      linkRouting.current = { path, onOpenDocument, onLinkError };
    }, [path, onOpenDocument, onLinkError]);

    useEffect(() => {
      if (!active) return;

      const timer = window.setTimeout(() => {
        setHeadings(editorRef.current?.getHeadings() ?? []);
        const current = outlineOpen && editorRef.current?.getViewport();
        if (outlineOpen && current) setViewport(current);
      }, 200);
      return () => window.clearTimeout(timer);
    }, [active, content, outlineOpen]);

    const handleViewportChange = useCallback((current: GalleyViewport) => {
      if (outlineOpen && active) setViewport(current);
    }, [active, outlineOpen]);

    const handleLinkClick = useCallback((url: string) => {
      if (url.startsWith("#")) return false;

      const { path, onOpenDocument, onLinkError } = linkRouting.current;
      void (async () => {
        if (await openEditorUrl(url)) return;
        const target = path && await resolveDocumentReference(path, url, "document");
        if (target && onOpenDocument) {
          const index = url.indexOf("#");
          onOpenDocument(target, index < 0 ? undefined : decodeURIComponent(url.slice(index + 1)));
        } else {
          onLinkError?.("Unable to open this link.");
        }
      })().catch(() => onLinkError?.("Unable to open this link."));

      return true;
    }, []);

    function closeOutline() {
      onToggleOutline?.();
      editorRef.current?.focus();
    }

    function navigateToHeading(position: number) {
      const editor = editorRef.current;
      if (!editor) return;
      editor.revealPosition(position, { align: "start", focus: true, select: true });
      if (window.matchMedia?.("(max-width: 720px)").matches) onToggleOutline?.();
    }

    const fontStyle = editorFontStyle(fontSettings);
    const outlinePosition = outlinePositionAtViewport(content, headings, viewport);

    return (
      <section
        className="document-view"
        hidden={!active}
        id={panelId}
        role="tabpanel"
        aria-label={labelledBy ? undefined : "Markdown document editor"}
        aria-labelledby={labelledBy}
        onMouseDownCapture={suppressMiddleButton}
        onAuxClickCapture={suppressMiddleButton}
      >
        <div
          className="document-editor"
          data-line-width={wordWrap && lineWidth > 0 ? lineWidth : undefined}
          style={{ "--document-line-width": `${lineWidth}ch` } as CSSProperties}
        >
          <EditorErrorBoundary content={content} documentKey={documentKey}>
            <GalleyEditor
              ref={editorRef}
              value={content}
              onChange={onContentChange}
              docKey={documentKey}
              ariaLabel="Markdown document editor"
              mode={mode}
              onModeChange={setMode}
              spellcheck={spellcheck}
              resolveImageSource={resolveImageSource}
              onLinkClick={handleLinkClick}
              onViewportChange={active && outlineOpen ? handleViewportChange : undefined}
              layout="fill"
              horizontalScroll={!wordWrap}
              theme={editorScheme ?? "auto"}
              surface={{
                className: "galley-pad-editor-surface",
                style: {
                  ...editorStyle,
                  "--ge-font-body": fontStyle.fontFamily,
                  "--ge-font-size": fontStyle.fontSize,
                } as CSSProperties,
              }}
              toolbar={
                toolbarVisible
                  ? {
                      icons: GALLEY_TOOLBAR_ICONS,
                    }
                  : false
              }
              tableControlIcons={GALLEY_TABLE_CONTROL_ICONS}
              footer={{
                before: <span className="document-footer-status">{status}</span>,
                after: ({ wordCount }: GalleyFooterContext) => (
                  <>
                    {IS_LINUX_DESKTOP && onMenuCommand ? (
                      <FooterMenuButton
                        wordWrap={wordWrap}
                        outlineOpen={outlineOpen}
                        outlineAvailable={headings.length >= 2}
                        onCommand={onMenuCommand}
                      />
                    ) : null}
                    <select
                      className="document-footer-mode"
                      aria-label="Editor mode"
                      value={mode}
                      onChange={(event) => setMode(event.target.value as GalleyMode)}
                    >
                      <option value="live">Live Preview</option>
                      <option value="markdown">Source</option>
                      <option value="preview">Preview</option>
                    </select>
                    {onToggleOutline && headings.length >= 2 ? (
                      <button
                        type="button"
                        className="document-footer-outline"
                        aria-label="Table of contents"
                        aria-expanded={outlineOpen}
                        aria-controls={outlineOpen ? outlineId : undefined}
                        onClick={onToggleOutline}
                      >
                        <TbListDetails size={16} aria-hidden="true" />
                      </button>
                    ) : null}
                    {updateReleaseUrl && onOpenUpdate ? (
                      <button
                        type="button"
                        className="document-footer-update"
                        onClick={onOpenUpdate}
                      >
                        Update available
                      </button>
                    ) : null}
                    <span className="document-footer-words">
                      {wordCount} {wordCount === 1 ? "word" : "words"}
                    </span>
                    <GalleyPadFooterMark />
                  </>
                ),
                logo: false,
                wordCount: false,
                characterCount: true,
              }}
            />
          </EditorErrorBoundary>
        </div>
        {outlineOpen && active && headings.length >= 2 ? (
          <DocumentOutline
            id={outlineId}
            outlineRef={outlineRef}
            headings={headings}
            viewportStart={outlinePosition}
            onNavigate={navigateToHeading}
            onClose={closeOutline}
          />
        ) : null}
      </section>
    );
  },
);

function suppressMiddleButton(event: ReactMouseEvent<HTMLElement>): void {
  if (event.button !== 1) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
}

const GALLEY_TOOLBAR_ICONS: Record<ToolbarIconName, ReactNode> = {
  heading: toolbarIcon(TbHeading),
  bold: toolbarIcon(TbBold),
  italic: toolbarIcon(TbItalic),
  strikethrough: toolbarIcon(TbStrikethrough),
  inlineCode: toolbarIcon(TbCode),
  bulletList: toolbarIcon(TbList),
  orderedList: toolbarIcon(TbListNumbers),
  taskList: toolbarIcon(TbListCheck),
  link: toolbarIcon(TbLink),
  image: toolbarIcon(TbPhoto),
  codeBlock: toolbarIcon(TbCodeblock),
  table: toolbarIcon(TbTable),
  divider: toolbarIcon(TbSeparatorHorizontal),
  undo: toolbarIcon(TbArrowBackUp),
  redo: toolbarIcon(TbArrowForwardUp),
  mode: toolbarIcon(TbLayoutSidebarRight),
};

const GALLEY_TABLE_CONTROL_ICONS: Record<
  GalleyTableControlIconName,
  ({ label }: { label: string }) => HTMLElement | null
> = {
  insertRowBefore: tableControlIcon(tableControlMarkup.insertRowBefore),
  insertRowAfter: tableControlIcon(tableControlMarkup.insertRowAfter),
  insertColumnBefore: tableControlIcon(tableControlMarkup.insertColumnBefore),
  insertColumnAfter: tableControlIcon(tableControlMarkup.insertColumnAfter),
  deleteRow: tableControlIcon(tableControlMarkup.deleteRow),
  deleteColumn: tableControlIcon(tableControlMarkup.deleteColumn),
  alignLeft: tableControlIcon(tableControlMarkup.alignLeft),
  alignCenter: tableControlIcon(tableControlMarkup.alignCenter),
  alignRight: tableControlIcon(tableControlMarkup.alignRight),
  clearAlignment: tableControlIcon(tableControlMarkup.clearAlignment),
  editSource: tableControlIcon(tableControlMarkup.editSource),
};

function toolbarIcon(Icon: IconType) {
  return (
    <span className="galley-toolbar-icon" aria-hidden="true">
      <Icon size={16} strokeWidth={2} />
    </span>
  );
}

function tableControlIcon(markup: string) {
  let cachedSvg: HTMLElement | null | undefined;

  function getCachedSvg() {
    if (cachedSvg !== undefined) {
      return cachedSvg;
    }

    const template = document.createElement("template");
    template.innerHTML = markup;
    cachedSvg = template.content.firstElementChild as HTMLElement | null;

    return cachedSvg;
  }

  return ({ label }: { label: string }) => {
    const svg = getCachedSvg()?.cloneNode(true) as HTMLElement | undefined;

    if (!svg) {
      return null;
    }

    svg.setAttribute("title", label);

    return svg;
  };
}
