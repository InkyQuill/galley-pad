import { useMemo, useRef, type RefObject } from "react";
import { createSideBySideLineDiff, type SideBySideDiffRow } from "../document/diff";

export type ExternalReconcileViewProps = {
  title: string;
  currentLabel: string;
  incomingLabel: string;
  currentContent: string;
  incomingContent: string;
  onClose: () => void;
  onReload: () => void;
  onSaveAs: () => void;
};

export function ExternalReconcileView({
  title,
  currentLabel,
  incomingLabel,
  currentContent,
  incomingContent,
  onClose,
  onReload,
  onSaveAs,
}: ExternalReconcileViewProps) {
  const rows = useMemo(
    () => createSideBySideLineDiff(currentContent, incomingContent),
    [currentContent, incomingContent],
  );
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  function syncScroll(source: "left" | "right") {
    if (syncing.current) {
      return;
    }

    const from = source === "left" ? leftRef.current : rightRef.current;
    const to = source === "left" ? rightRef.current : leftRef.current;
    if (!from || !to) {
      return;
    }

    syncing.current = true;
    to.scrollTop = from.scrollTop;
    to.scrollLeft = from.scrollLeft;
    syncing.current = false;
  }

  return (
    <section className="external-reconcile" aria-label={`Reconcile ${title}`}>
      <header className="external-reconcile-toolbar">
        <h2>{title}</h2>
        <div>
          <button type="button" className="button-secondary" onClick={onClose}>
            Back to editor
          </button>
          <button type="button" className="button-secondary" onClick={onSaveAs}>
            Save my changes as
          </button>
          <button type="button" className="button-danger" onClick={onReload}>
            Reload from disk
          </button>
        </div>
      </header>
      <div className="external-reconcile-grid">
        <DiffPane
          label={currentLabel}
          side="left"
          rows={rows}
          paneRef={leftRef}
          onScroll={() => syncScroll("left")}
        />
        <DiffPane
          label={incomingLabel}
          side="right"
          rows={rows}
          paneRef={rightRef}
          onScroll={() => syncScroll("right")}
        />
      </div>
    </section>
  );
}

function DiffPane({
  label,
  side,
  rows,
  paneRef,
  onScroll,
}: {
  label: string;
  side: "left" | "right";
  rows: SideBySideDiffRow[];
  paneRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}) {
  return (
    <section className="external-reconcile-pane" role="region" aria-label={label}>
      <h3>{label}</h3>
      <div
        className="external-reconcile-editor"
        data-testid={`diff-pane-${side}`}
        ref={paneRef}
        onScroll={onScroll}
      >
        {rows.map((row, index) => {
          const text = side === "left" ? row.left : row.right;
          const highlighted =
            row.kind === "changed" ||
            (side === "left" && row.kind === "removed") ||
            (side === "right" && row.kind === "added");

          return (
            <div
              className={`external-reconcile-line external-reconcile-line-${row.kind}`}
              data-testid={highlighted ? `diff-row-${row.kind}` : undefined}
              key={`${side}:${index}:${row.kind}:${text}`}
            >
              <span className="external-reconcile-line-number">{index + 1}</span>
              <code>{text || " "}</code>
            </div>
          );
        })}
      </div>
    </section>
  );
}
