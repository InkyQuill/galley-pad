import { GalleyEditor, type ToolbarIconName } from "@inky/galley-editor";
import type { ReactNode } from "react";
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

export type DocumentViewProps = {
  content: string;
  onContentChange: (content: string) => void;
  toolbarVisible?: boolean;
};

export function DocumentView({
  content,
  onContentChange,
  toolbarVisible = false,
}: DocumentViewProps) {
  return (
    <main className="document-view" aria-label="Markdown document editor">
      <GalleyEditor
        value={content}
        onChange={onContentChange}
        toolbar={
          toolbarVisible
            ? {
                icons: GALLEY_TOOLBAR_ICONS,
              }
            : false
        }
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
