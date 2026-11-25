import { useEffect, useRef } from "react";

type Props = {
  paths: readonly string[];
  onOpen(path: string): void;
  onRemove(path: string): void;
  onClose(): void;
};

export function RecentFilesDialog({ paths, onOpen, onRemove, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
  }, []);

  return (
    <dialog
      ref={dialog}
      className="settings-dialog recent-files-dialog"
      aria-labelledby="recent-files-title"
      onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="recent-files-content">
        <header className="settings-dialog-header">
          <h2 id="recent-files-title">Open Recent</h2>
          <button type="button" className="button-secondary" onClick={onClose}>Close</button>
        </header>
        {paths.length === 0 ? <p>No recent documents</p> : (
          <ul className="recent-file-list">
            {paths.map((path) => {
              const name = path.split(/[\\/]/).pop() ?? path;
              return (
                <li key={path} className="recent-file-row">
                  <button type="button" className="recent-file-open" onClick={() => onOpen(path)}>
                    <strong>{name}</strong>
                    <small title={path}>{path}</small>
                  </button>
                  <button type="button" className="button-secondary" aria-label={`Remove ${name} from recent files`} onClick={() => onRemove(path)}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </dialog>
  );
}
