import { useMemo, useState } from "react";
import { DocumentView } from "./components/DocumentView";
import {
  createUntitledSession,
  updateSessionContent,
} from "./document/session";

export default function App() {
  const [document, setDocument] = useState(() => createUntitledSession());

  const wordCount = useMemo(() => {
    const words = document.content
      .trim()
      .split(/\s+/)
      .filter((word) => /[A-Za-z0-9]/.test(word));
    return words.length;
  }, [document.content]);

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="document-title">
          <span className="document-name">{document.displayName}</span>
          <span className="document-state">
            {document.dirty ? "Unsaved" : "Draft"}
          </span>
        </div>
        <div className="document-meta" aria-label="Document statistics">
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </div>
      </header>

      <DocumentView
        content={document.content}
        onContentChange={(content) =>
          setDocument((current) => updateSessionContent(current, content))
        }
      />
    </div>
  );
}
