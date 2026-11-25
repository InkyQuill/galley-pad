import { DialogSurface } from "./DialogSurface";

type Props = {
  paths: readonly string[];
  onOpen(path: string): void;
  onRemove(path: string): void;
  onClose(): void;
};

export function RecentFilesDialog({ paths, onOpen, onRemove, onClose }: Props) {
  return (
    <DialogSurface
      title="Open Recent"
      closeLabel="Close"
      className="recent-files-dialog"
      onClose={onClose}
    >
      {paths.length === 0 ? <p className="recent-files-empty">No recent documents</p> : (
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
    </DialogSurface>
  );
}
