import { GalleyEditor } from "@inky/galley-editor";

export type DocumentViewProps = {
  content: string;
  onContentChange: (content: string) => void;
};

export function DocumentView({ content, onContentChange }: DocumentViewProps) {
  return (
    <main className="document-view" aria-label="Markdown document editor">
      <GalleyEditor value={content} onChange={onContentChange} />
    </main>
  );
}
