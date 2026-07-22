import {
  GalleyEditor,
  type GalleyFooterContext,
  type GalleyTableControlIconName,
  type ToolbarIconName,
} from "@inkyquill/galley-editor";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  TbAlignCenter,
  TbAlignLeft,
  TbAlignRight,
  TbBold,
  TbClearFormatting,
  TbCode,
  TbCodeblock,
  TbColumnInsertLeft,
  TbColumnInsertRight,
  TbColumnRemove,
  TbLayoutSidebarRight,
  TbLink,
  TbList,
  TbListCheck,
  TbListNumbers,
  TbMarkdown,
  TbPhoto,
  TbRowInsertBottom,
  TbRowInsertTop,
  TbRowRemove,
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

export type DocumentViewProps = {
  content: string;
  onContentChange: (content: string) => void;
  panelId?: string;
  labelledBy?: string;
  toolbarVisible?: boolean;
  editorScheme?: "auto" | "light" | "dark";
  editorStyle?: EditorSurfaceStyle;
  fontSettings?: EditorFontSettings;
  status?: string;
  onMenuCommand?: (command: AppMenuCommand) => void;
};

export function DocumentView({
  content,
  onContentChange,
  panelId,
  labelledBy,
  toolbarVisible = false,
  editorScheme,
  editorStyle,
  fontSettings = { family: "system", size: "medium" },
  status = "Draft",
  onMenuCommand,
}: DocumentViewProps) {
  const fontStyle = editorFontStyle(fontSettings);

  return (
    <main
      className="document-view"
      id={panelId}
      role="tabpanel"
      aria-label={labelledBy ? undefined : "Markdown document editor"}
      aria-labelledby={labelledBy}
      onMouseDownCapture={suppressMiddleButton}
      onAuxClickCapture={suppressMiddleButton}
    >
      <GalleyEditor
        value={content}
        onChange={onContentChange}
        layout="fill"
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
                <FooterMenuButton onCommand={onMenuCommand} />
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
    </main>
  );
}

function suppressMiddleButton(event: ReactMouseEvent<HTMLElement>): void {
  if (event.button !== 1) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
}

const GALLEY_TOOLBAR_ICONS: Record<ToolbarIconName, ReactNode> = {
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
  insertRowBefore: tableControlIcon(TbRowInsertTop),
  insertRowAfter: tableControlIcon(TbRowInsertBottom),
  insertColumnBefore: tableControlIcon(TbColumnInsertLeft),
  insertColumnAfter: tableControlIcon(TbColumnInsertRight),
  deleteRow: tableControlIcon(TbRowRemove),
  deleteColumn: tableControlIcon(TbColumnRemove),
  alignLeft: tableControlIcon(TbAlignLeft),
  alignCenter: tableControlIcon(TbAlignCenter),
  alignRight: tableControlIcon(TbAlignRight),
  clearAlignment: tableControlIcon(TbClearFormatting),
  editSource: tableControlIcon(TbMarkdown),
};

function toolbarIcon(Icon: IconType) {
  return (
    <span className="galley-toolbar-icon" aria-hidden="true">
      <Icon size={16} strokeWidth={2} />
    </span>
  );
}

function tableControlIcon(Icon: IconType) {
  let cachedSvg: HTMLElement | null | undefined;

  function getCachedSvg() {
    if (cachedSvg !== undefined) {
      return cachedSvg;
    }

    const template = document.createElement("template");
    template.innerHTML = renderToStaticMarkup(
      <Icon size={16} strokeWidth={2} />,
    );
    cachedSvg = template.content.firstElementChild as HTMLElement | null;

    if (cachedSvg) {
      cachedSvg.classList.add("galley-table-control-icon");
      cachedSvg.setAttribute("aria-hidden", "true");
      cachedSvg.setAttribute("focusable", "false");
    }

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
