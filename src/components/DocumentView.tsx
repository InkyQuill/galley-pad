import {
  GalleyEditor,
  type GalleyFooterContext,
  type ToolbarIconName,
} from "@inky/galley-editor";
import type { CSSProperties, ReactNode } from "react";
import {
  Bold,
  Code,
  CodeXml,
  Image,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  PanelsTopLeft,
  Redo2,
  SeparatorHorizontal,
  Strikethrough,
  Table2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import {
  editorFontStyle,
  type EditorFontSettings,
} from "../settings/appearance";

export type DocumentViewProps = {
  content: string;
  onContentChange: (content: string) => void;
  panelId?: string;
  labelledBy?: string;
  toolbarVisible?: boolean;
  editorScheme?: "auto" | "light" | "dark";
  fontSettings?: EditorFontSettings;
  status?: string;
};

export function DocumentView({
  content,
  onContentChange,
  panelId,
  labelledBy,
  toolbarVisible = false,
  editorScheme,
  fontSettings = { family: "system", size: "medium" },
  status = "Draft",
}: DocumentViewProps) {
  const fontStyle = editorFontStyle(fontSettings);

  return (
    <main
      className="document-view"
      id={panelId}
      role="tabpanel"
      aria-label={labelledBy ? undefined : "Markdown document editor"}
      aria-labelledby={labelledBy}
    >
      <GalleyEditor
        value={content}
        onChange={onContentChange}
        layout="fill"
        theme={editorScheme ?? "auto"}
        surface={{
          className: "galley-pad-editor-surface",
          style: {
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
        footer={{
          before: <span className="document-footer-status">{status}</span>,
          after: ({ wordCount }: GalleyFooterContext) => (
            <span className="document-footer-words">
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </span>
          ),
          wordCount: false,
          characterCount: true,
        }}
      />
    </main>
  );
}

const GALLEY_TOOLBAR_ICONS: Record<ToolbarIconName, ReactNode> = {
  bold: icon(Bold),
  italic: icon(Italic),
  strikethrough: icon(Strikethrough),
  inlineCode: icon(Code),
  bulletList: icon(List),
  orderedList: icon(ListOrdered),
  taskList: icon(ListChecks),
  link: icon(Link),
  image: icon(Image),
  codeBlock: icon(CodeXml),
  table: icon(Table2),
  divider: icon(SeparatorHorizontal),
  undo: icon(Undo2),
  redo: icon(Redo2),
  mode: icon(PanelsTopLeft),
};

function icon(Icon: LucideIcon) {
  return (
    <span className="galley-toolbar-icon" aria-hidden="true">
      <Icon size={16} strokeWidth={2} />
    </span>
  );
}
