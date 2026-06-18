import { useEffect, useMemo, useState } from "react";
import { DocumentView } from "./components/DocumentView";
import {
  createLifecycleDependencies,
  newDocument,
  openDocument,
  saveDocument,
  saveDocumentAs,
  type LifecycleDependencies,
} from "./document/lifecycle";
import {
  createUntitledSession,
  updateSessionContent,
  type DocumentSession,
} from "./document/session";
import { pickOpenFile, pickSaveFile } from "./tauri/dialogs";
import { readTextFile, writeTextFile } from "./tauri/files";

type CommandName = "New" | "Open" | "Save" | "Save As";

export default function App() {
  const [document, setDocument] = useState(() => createUntitledSession());
  const [pendingCommand, setPendingCommand] = useState<CommandName | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const dependencies = useMemo<LifecycleDependencies>(
    () =>
      createLifecycleDependencies({
        pickOpenFile,
        pickSaveFile,
        readTextFile,
        writeTextFile,
      }),
    [],
  );

  const wordCount = useMemo(() => {
    const words = document.content
      .trim()
      .split(/\s+/)
      .filter((word) => /[A-Za-z0-9]/.test(word));
    return words.length;
  }, [document.content]);

  useEffect(() => {
    globalThis.document.title = `${document.dirty ? "* " : ""}${
      document.displayName
    } - Galley Pad`;
  }, [document.dirty, document.displayName]);

  function runCommand(
    name: CommandName,
    command: () => Promise<DocumentSession | null> | DocumentSession | null,
  ) {
    setCommandError(null);
    setPendingCommand(name);

    try {
      const result = command();
      if (isPromiseLike(result)) {
        void result
          .then((next) => {
            if (next) {
              setDocument(next);
            }
          })
          .catch((error: unknown) => {
            setCommandError(errorMessage(error));
          })
          .finally(() => {
            setPendingCommand(null);
          });
        return;
      }

      if (result) {
        setDocument(result);
      }
      setPendingCommand(null);
    } catch (error) {
      setCommandError(errorMessage(error));
      setPendingCommand(null);
    }
  }

  function confirmDirtyReplacement(): boolean {
    if (!document.dirty) {
      return true;
    }

    return window.confirm(`Discard unsaved changes to ${document.displayName}?`);
  }

  const busy = pendingCommand !== null;

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="document-title">
          <span className="document-name">{document.displayName}</span>
          <span className="document-state">
            {document.dirty ? "Unsaved" : document.path ? "Saved" : "Draft"}
          </span>
        </div>
        <div className="document-meta" aria-label="Document statistics">
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </div>
      </header>

      <div className="commandbar" aria-label="File commands">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            runCommand("New", () =>
              confirmDirtyReplacement() ? newDocument(document) : null,
            )
          }
        >
          New
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            runCommand("Open", () =>
              confirmDirtyReplacement() ? openDocument(dependencies) : null,
            )
          }
        >
          Open
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            runCommand("Save", () => saveDocument(document, dependencies))
          }
        >
          Save
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            runCommand("Save As", () => saveDocumentAs(document, dependencies))
          }
        >
          Save As
        </button>
        <span className="command-status" aria-live="polite">
          {pendingCommand ? `${pendingCommand}...` : ""}
        </span>
      </div>

      {commandError ? (
        <div className="command-error" role="alert" aria-label="File command error">
          {commandError}
        </div>
      ) : null}

      <DocumentView
        content={document.content}
        onContentChange={(content) =>
          setDocument((current) => updateSessionContent(current, content))
        }
      />
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isPromiseLike(
  value: Promise<DocumentSession | null> | DocumentSession | null,
): value is Promise<DocumentSession | null> {
  return typeof value === "object" && value !== null && "then" in value;
}
