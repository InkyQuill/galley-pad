import { useMemo, useState } from "react";
import { DocumentView } from "./components/DocumentView";

const INITIAL_DOCUMENT = `# Untitled

Start writing Markdown.
`;

export default function App() {
  const [content, setContent] = useState(INITIAL_DOCUMENT);

  const wordCount = useMemo(() => {
    const words = content
      .trim()
      .split(/\s+/)
      .filter((word) => /[A-Za-z0-9]/.test(word));
    return words.length;
  }, [content]);

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="document-title">
          <span className="document-name">Untitled.md</span>
          <span className="document-state">Draft</span>
        </div>
        <div className="document-meta" aria-label="Document statistics">
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </div>
      </header>

      <DocumentView content={content} onContentChange={setContent} />
    </div>
  );
}
