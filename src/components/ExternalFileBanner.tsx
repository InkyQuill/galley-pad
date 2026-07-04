type UpdateProps = {
  kind: "clean-update" | "conflict";
  displayName: string;
  onReload: () => void;
  onReconcile: () => void;
  onFollow?: () => void;
  onKeepAsking?: () => void;
  onKeepEditing?: () => void;
  onSaveAs?: () => void;
};

type DeletedProps = {
  kind: "deleted";
  displayName: string;
  onSaveAs: () => void;
  onKeepEditing: () => void;
};

export type ExternalFileBannerProps = UpdateProps | DeletedProps;

export function ExternalFileBanner(props: ExternalFileBannerProps) {
  if (props.kind === "deleted") {
    return (
      <section
        className="external-file-banner external-file-banner-warning"
        role="status"
        aria-label="External file deletion"
      >
        <div>
          <strong>{props.displayName} was deleted on disk.</strong>
          <p>The editor still has the last loaded content.</p>
        </div>
        <div className="external-file-banner-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={props.onKeepEditing}
          >
            Keep editing
          </button>
          <button
            type="button"
            className="button-primary"
            onClick={props.onSaveAs}
          >
            Save As
          </button>
        </div>
      </section>
    );
  }

  const isConflict = props.kind === "conflict";

  return (
    <section
      className="external-file-banner external-file-banner-warning"
      role="status"
      aria-label={isConflict ? "External file conflict" : "External file update"}
    >
      <div>
        <strong>
          {isConflict
            ? `${props.displayName} changed outside Galley Pad while you have unsaved edits.`
            : `${props.displayName} changed outside Galley Pad.`}
        </strong>
        <p>
          {isConflict
            ? "Reconcile to compare your content with the incoming disk version."
            : "Reload, follow future clean updates, or reconcile before deciding."}
        </p>
      </div>
      <div className="external-file-banner-actions">
        {isConflict ? (
          <button
            type="button"
            className="button-secondary"
            onClick={props.onKeepEditing}
          >
            Keep editing
          </button>
        ) : (
          <button
            type="button"
            className="button-secondary"
            onClick={props.onKeepAsking}
          >
            Keep asking
          </button>
        )}
        <button
          type="button"
          className="button-secondary"
          onClick={props.onReconcile}
        >
          Reconcile
        </button>
        {props.onFollow ? (
          <button
            type="button"
            className="button-secondary"
            onClick={props.onFollow}
          >
            Follow updates
          </button>
        ) : null}
        {props.onSaveAs ? (
          <button
            type="button"
            className="button-secondary"
            onClick={props.onSaveAs}
          >
            Save my changes as
          </button>
        ) : null}
        <button
          type="button"
          className={isConflict ? "button-danger" : "button-primary"}
          onClick={props.onReload}
        >
          {isConflict ? "Reload from disk" : "Reload"}
        </button>
      </div>
    </section>
  );
}
