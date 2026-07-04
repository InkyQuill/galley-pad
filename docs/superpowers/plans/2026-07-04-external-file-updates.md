# External File Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect external changes or deletion for open Markdown files, show an in-app banner for warnings, and open a side-by-side reconcile view only when the user asks to inspect differences.

**Architecture:** Keep external file handling in the Galley Pad app shell. Add runtime-only per-session update policy, classify external updates/deletions in document lifecycle helpers, show lightweight warning banners in `App.tsx`, and add a dedicated scroll-synced reconcile surface with current content on the left and incoming disk content on the right.

**Tech Stack:** React 19, TypeScript 6, Vitest, Testing Library, Playwright, Tauri command wrappers.

---

## Branch

Work on branch `feat/external-file-updates`.

## File Structure

- Modify `docs/product-principles.md`
  - Add the product rule: banners are for information and warnings; modals/dialogs are for critical decisions.
- Modify `src/document/session.ts` and `src/document/session.test.ts`
  - Add runtime-only `externalUpdatePolicy` and `lastNoticedExternalModifiedAt`.
  - Add helpers for reload, policy changes, noticed mtimes, and restore-time reset.
- Modify `src/document/lifecycle.ts` and `src/document/lifecycle.test.ts`
  - Add external update classification, including deleted-file detection.
- Create `src/document/diff.ts` and `src/document/diff.test.ts`
  - Compute line-level pair rows for side-by-side highlighting.
- Create `src/components/ExternalFileBanner.tsx` and `src/components/ExternalFileBanner.test.tsx`
  - Render warning banners without diffs.
- Create `src/components/ExternalReconcileView.tsx` and `src/components/ExternalReconcileView.test.tsx`
  - Render scroll-synced side-by-side read-only editor panes with line highlights.
- Modify `src/App.tsx` and `src/App.test.tsx`
  - Wire external checks, banners, follow/reload/keep asking, deleted warnings, reconcile mode, conflict actions, and save-time checks.
- Modify `src/styles.css`
  - Style banners and the side-by-side reconcile surface.
- Modify `tests/integration/app.spec.ts`
  - Cover banner display and opening the reconcile view.

## Task 1: Document the Banner vs Modal Rule

**Files:**
- Modify: `docs/product-principles.md`

- [ ] **Step 1: Add the product principle**

Add this section after `## 6. Honest Dirty State` and renumber the existing “Defaults Matter More Than Settings” section from `## 7` to `## 8`:

```md
## 7. Banners Warn, Modals Decide

Informational and warning states should appear inline as banners. A file changed on disk, a file was deleted, a background refresh completed, or a recoverable problem needs attention: these are banner cases.

Modal dialogs are reserved for critical decisions that block progress or risk data loss, such as closing a document with unsaved changes. Do not use a modal only to announce an external update.
```

- [ ] **Step 2: Review the docs diff**

Run:

```bash
git diff -- docs/product-principles.md
```

Expected: only the new principle and heading renumbering changed.

- [ ] **Step 3: Commit**

```bash
git add docs/product-principles.md
git commit -m "docs: define banner and modal usage"
```

## Task 2: Session Runtime State

**Files:**
- Modify: `src/document/session.ts`
- Modify: `src/document/session.test.ts`

- [ ] **Step 1: Write failing tests**

In `src/document/session.test.ts`, import the new helpers:

```ts
import {
  applyExternalFileReload,
  markExternalUpdateNoticed,
  resetExternalUpdateRuntimeState,
  setExternalUpdatePolicy,
} from "./session";
```

Update the untitled-session expectation to include:

```ts
externalUpdatePolicy: "ask",
lastNoticedExternalModifiedAt: null,
```

Add:

```ts
it("manages external update runtime state", () => {
  const session = createSessionFromFile({
    path: "/tmp/notes.md",
    content: "Original\n",
    lineEnding: "lf",
    lastModifiedAt: 10,
  });

  const following = setExternalUpdatePolicy(session, "follow");
  expect(following.externalUpdatePolicy).toBe("follow");

  const noticed = markExternalUpdateNoticed(following, 12);
  expect(noticed.lastNoticedExternalModifiedAt).toBe(12);

  const reloaded = applyExternalFileReload(noticed, {
    path: "/tmp/notes.md",
    content: "External\n",
    lineEnding: "crlf",
    lastModifiedAt: 14,
  });
  expect(reloaded).toMatchObject({
    content: "External\n",
    savedContent: "External\n",
    dirty: false,
    lineEnding: "crlf",
    lastKnownModifiedAt: 14,
    externalUpdatePolicy: "follow",
    lastNoticedExternalModifiedAt: null,
  });

  expect(resetExternalUpdateRuntimeState(reloaded)).toMatchObject({
    externalUpdatePolicy: "ask",
    lastNoticedExternalModifiedAt: null,
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run test:unit -- src/document/session.test.ts
```

Expected: fails because the fields and helpers do not exist.

- [ ] **Step 3: Implement session helpers**

In `src/document/session.ts`, add:

```ts
export type ExternalUpdatePolicy = "ask" | "follow";
```

Extend `DocumentSession`:

```ts
  externalUpdatePolicy: ExternalUpdatePolicy;
  lastNoticedExternalModifiedAt: number | null;
```

Add defaults:

```ts
const EXTERNAL_UPDATE_RUNTIME_DEFAULTS = {
  externalUpdatePolicy: "ask" as const,
  lastNoticedExternalModifiedAt: null,
};
```

Spread those defaults into `createUntitledSession`, `createSessionFromFile`, and `markSessionSaved`.

Add:

```ts
export function setExternalUpdatePolicy(
  session: DocumentSession,
  externalUpdatePolicy: ExternalUpdatePolicy,
): DocumentSession {
  return { ...session, externalUpdatePolicy };
}

export function markExternalUpdateNoticed(
  session: DocumentSession,
  lastNoticedExternalModifiedAt: number | null,
): DocumentSession {
  return { ...session, lastNoticedExternalModifiedAt };
}

export function applyExternalFileReload(
  session: DocumentSession,
  file: FileReadResult,
): DocumentSession {
  return {
    ...session,
    id: `file:${file.path}`,
    path: file.path,
    displayName: displayNameFromPath(file.path),
    content: file.content,
    savedContent: file.content,
    dirty: false,
    lineEnding: file.lineEnding,
    lastKnownModifiedAt: file.lastModifiedAt,
    lastNoticedExternalModifiedAt: null,
  };
}

export function resetExternalUpdateRuntimeState(
  session: DocumentSession,
): DocumentSession {
  return {
    ...session,
    ...EXTERNAL_UPDATE_RUNTIME_DEFAULTS,
  };
}
```

- [ ] **Step 4: Verify and commit**

```bash
npm run test:unit -- src/document/session.test.ts
git add src/document/session.ts src/document/session.test.ts
git commit -m "feat(document): track external update session state"
```

## Task 3: External Change and Deletion Classification

**Files:**
- Modify: `src/document/lifecycle.ts`
- Modify: `src/document/lifecycle.test.ts`

- [ ] **Step 1: Write failing tests**

Add `checkExternalFileChange` to lifecycle imports in `src/document/lifecycle.test.ts`.

Add:

```ts
it("reports clean external updates, dirty conflicts, and deleted files", async () => {
  const clean = createSessionFromFile({
    path: "/tmp/clean.md",
    content: "Base\n",
    lineEnding: "lf",
    lastModifiedAt: 10,
  });
  const dirty = updateSessionContent(clean, "Local\n");

  const cleanDeps = createLifecycleDependencies({
    pickOpenFile: vi.fn(),
    pickSaveFile: vi.fn(),
    readTextFile: vi.fn().mockResolvedValue({
      path: "/tmp/clean.md",
      content: "External\n",
      lineEnding: "lf",
      lastModifiedAt: 12,
    }),
    writeTextFile: vi.fn(),
  });
  await expect(checkExternalFileChange(clean, cleanDeps)).resolves.toMatchObject({
    kind: "clean-update",
    external: { content: "External\n", lastModifiedAt: 12 },
  });

  const conflictDeps = createLifecycleDependencies({
    pickOpenFile: vi.fn(),
    pickSaveFile: vi.fn(),
    readTextFile: vi.fn().mockResolvedValue({
      path: "/tmp/clean.md",
      content: "External\n",
      lineEnding: "lf",
      lastModifiedAt: 12,
    }),
    writeTextFile: vi.fn(),
  });
  await expect(checkExternalFileChange(dirty, conflictDeps)).resolves.toMatchObject({
    kind: "conflict",
    base: "Base\n",
    local: "Local\n",
  });

  const deletedDeps = createLifecycleDependencies({
    pickOpenFile: vi.fn(),
    pickSaveFile: vi.fn(),
    readTextFile: vi.fn().mockResolvedValue({
      path: "/tmp/clean.md",
      content: "",
      lineEnding: "lf",
      lastModifiedAt: null,
    }),
    writeTextFile: vi.fn(),
  });
  await expect(checkExternalFileChange(clean, deletedDeps)).resolves.toEqual({
    kind: "deleted",
    session: clean,
    path: "/tmp/clean.md",
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run test:unit -- src/document/lifecycle.test.ts
```

Expected: fails because `checkExternalFileChange` is missing.

- [ ] **Step 3: Implement classification**

Add to `src/document/lifecycle.ts`:

```ts
export type ExternalFileChangeResult =
  | { kind: "unchanged" }
  | { kind: "deleted"; session: DocumentSession; path: string }
  | { kind: "metadata-refresh"; session: DocumentSession }
  | { kind: "clean-update"; session: DocumentSession; external: FileReadResult }
  | {
      kind: "conflict";
      session: DocumentSession;
      external: FileReadResult;
      base: string;
      local: string;
    };
```

Implement:

```ts
export async function checkExternalFileChange(
  session: DocumentSession,
  dependencies: LifecycleDependencies,
): Promise<ExternalFileChangeResult> {
  if (!session.path || session.lastKnownModifiedAt === null) {
    return { kind: "unchanged" };
  }

  const external = await dependencies.readTextFile(session.path);
  if (external.lastModifiedAt === null) {
    return { kind: "deleted", session, path: session.path };
  }

  if (external.lastModifiedAt === session.lastKnownModifiedAt) {
    return { kind: "unchanged" };
  }

  if (external.lastModifiedAt === session.lastNoticedExternalModifiedAt) {
    return { kind: "unchanged" };
  }

  if (external.content === session.savedContent) {
    return {
      kind: "metadata-refresh",
      session: {
        ...session,
        lastKnownModifiedAt: external.lastModifiedAt,
        lineEnding: external.lineEnding,
        lastNoticedExternalModifiedAt: null,
      },
    };
  }

  if (!session.dirty) {
    return { kind: "clean-update", session, external };
  }

  return {
    kind: "conflict",
    session,
    external,
    base: session.savedContent,
    local: session.content,
  };
}
```

- [ ] **Step 4: Verify and commit**

```bash
npm run test:unit -- src/document/lifecycle.test.ts
git add src/document/lifecycle.ts src/document/lifecycle.test.ts
git commit -m "feat(document): classify external file changes"
```

## Task 4: Side-by-Side Diff Rows

**Files:**
- Create: `src/document/diff.ts`
- Create: `src/document/diff.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/document/diff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSideBySideLineDiff } from "./diff";

describe("side-by-side line diff", () => {
  it("aligns unchanged, removed, added, and changed rows", () => {
    expect(createSideBySideLineDiff("A\nOld\nC\n", "A\nNew\nC\n")).toEqual([
      { kind: "unchanged", left: "A", right: "A" },
      { kind: "changed", left: "Old", right: "New" },
      { kind: "unchanged", left: "C", right: "C" },
    ]);
  });

  it("uses empty cells for pure additions and removals", () => {
    expect(createSideBySideLineDiff("A\nB\n", "A\nC\nB\nD\n")).toEqual([
      { kind: "unchanged", left: "A", right: "A" },
      { kind: "added", left: "", right: "C" },
      { kind: "unchanged", left: "B", right: "B" },
      { kind: "added", left: "", right: "D" },
    ]);
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run test:unit -- src/document/diff.test.ts
```

Expected: fails because the module does not exist.

- [ ] **Step 3: Implement diff rows**

Create `src/document/diff.ts`:

```ts
export type SideBySideDiffKind = "unchanged" | "added" | "removed" | "changed";

export type SideBySideDiffRow = {
  kind: SideBySideDiffKind;
  left: string;
  right: string;
};

export function createSideBySideLineDiff(
  leftText: string,
  rightText: string,
): SideBySideDiffRow[] {
  const left = splitLines(leftText);
  const right = splitLines(rightText);
  const table = lcsTable(left, right);
  const rows: SideBySideDiffRow[] = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      rows.push({ kind: "unchanged", left: left[i], right: right[j] });
      i += 1;
      j += 1;
    } else if (
      i + 1 < left.length &&
      j + 1 < right.length &&
      left[i + 1] === right[j + 1]
    ) {
      rows.push({ kind: "changed", left: left[i], right: right[j] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      rows.push({ kind: "removed", left: left[i], right: "" });
      i += 1;
    } else {
      rows.push({ kind: "added", left: "", right: right[j] });
      j += 1;
    }
  }

  while (i < left.length) {
    rows.push({ kind: "removed", left: left[i], right: "" });
    i += 1;
  }

  while (j < right.length) {
    rows.push({ kind: "added", left: "", right: right[j] });
    j += 1;
  }

  return rows;
}

function splitLines(value: string): string[] {
  if (value === "") return [];
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  if (value.endsWith("\n")) lines.pop();
  return lines;
}

function lcsTable(left: string[], right: string[]): number[][] {
  const table = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => 0),
  );
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        left[i] === right[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}
```

- [ ] **Step 4: Verify and commit**

```bash
npm run test:unit -- src/document/diff.test.ts
git add src/document/diff.ts src/document/diff.test.ts
git commit -m "feat(document): add side-by-side diff rows"
```

## Task 5: Warning Banner Component

**Files:**
- Create: `src/components/ExternalFileBanner.tsx`
- Create: `src/components/ExternalFileBanner.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/ExternalFileBanner.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExternalFileBanner } from "./ExternalFileBanner";

describe("ExternalFileBanner", () => {
  it("shows external update warning without rendering diffs", () => {
    const reconcile = vi.fn();
    render(
      <ExternalFileBanner
        kind="clean-update"
        displayName="notes.md"
        onReload={vi.fn()}
        onFollow={vi.fn()}
        onKeepAsking={vi.fn()}
        onReconcile={reconcile}
      />,
    );

    const banner = screen.getByRole("status", { name: "External file update" });
    expect(banner).toHaveTextContent("notes.md changed outside Galley Pad.");
    expect(screen.queryByRole("region", { name: /changes/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reconcile" }));
    expect(reconcile).toHaveBeenCalledOnce();
  });

  it("shows deleted file warning", () => {
    render(
      <ExternalFileBanner
        kind="deleted"
        displayName="gone.md"
        onSaveAs={vi.fn()}
        onKeepEditing={vi.fn()}
      />,
    );

    expect(screen.getByRole("status", { name: "External file deletion" })).toHaveTextContent(
      "gone.md was deleted on disk.",
    );
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run test:unit -- src/components/ExternalFileBanner.test.tsx
```

Expected: fails because the component does not exist.

- [ ] **Step 3: Implement banner component**

Create `src/components/ExternalFileBanner.tsx`:

```tsx
type UpdateProps = {
  kind: "clean-update" | "conflict";
  displayName: string;
  onReload: () => void;
  onFollow?: () => void;
  onKeepAsking?: () => void;
  onKeepEditing?: () => void;
  onSaveAs?: () => void;
  onReconcile: () => void;
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
      <section className="external-file-banner external-file-banner-warning" role="status" aria-label="External file deletion">
        <div>
          <strong>{props.displayName} was deleted on disk.</strong>
          <p>The editor still has the last loaded content.</p>
        </div>
        <div className="external-file-banner-actions">
          <button type="button" className="button-secondary" onClick={props.onKeepEditing}>Keep editing</button>
          <button type="button" className="button-primary" onClick={props.onSaveAs}>Save As</button>
        </div>
      </section>
    );
  }

  const isConflict = props.kind === "conflict";
  return (
    <section className="external-file-banner external-file-banner-warning" role="status" aria-label={isConflict ? "External file conflict" : "External file update"}>
      <div>
        <strong>
          {isConflict
            ? `${props.displayName} changed outside Galley Pad while you have unsaved edits.`
            : `${props.displayName} changed outside Galley Pad.`}
        </strong>
        <p>{isConflict ? "Reconcile to compare your content with the incoming disk version." : "Reload, follow future clean updates, or reconcile before deciding."}</p>
      </div>
      <div className="external-file-banner-actions">
        {isConflict ? (
          <button type="button" className="button-secondary" onClick={props.onKeepEditing}>Keep editing</button>
        ) : (
          <button type="button" className="button-secondary" onClick={props.onKeepAsking}>Keep asking</button>
        )}
        <button type="button" className="button-secondary" onClick={props.onReconcile}>Reconcile</button>
        {props.onFollow ? <button type="button" className="button-secondary" onClick={props.onFollow}>Follow updates</button> : null}
        {props.onSaveAs ? <button type="button" className="button-secondary" onClick={props.onSaveAs}>Save my changes as...</button> : null}
        <button type="button" className={isConflict ? "button-danger" : "button-primary"} onClick={props.onReload}>
          {isConflict ? "Reload from disk" : "Reload"}
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Verify and commit**

```bash
npm run test:unit -- src/components/ExternalFileBanner.test.tsx
git add src/components/ExternalFileBanner.tsx src/components/ExternalFileBanner.test.tsx
git commit -m "feat(app): add external file warning banner"
```

## Task 6: Side-by-Side Reconcile View

**Files:**
- Create: `src/components/ExternalReconcileView.tsx`
- Create: `src/components/ExternalReconcileView.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/ExternalReconcileView.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExternalReconcileView } from "./ExternalReconcileView";

describe("ExternalReconcileView", () => {
  it("shows current and incoming content side by side with highlighted changed rows", () => {
    render(
      <ExternalReconcileView
        title="notes.md"
        currentLabel="Current in Galley Pad"
        incomingLabel="Incoming from disk"
        currentContent="Base\nLocal\n"
        incomingContent="Base\nExternal\n"
        onClose={vi.fn()}
        onReload={vi.fn()}
        onSaveAs={vi.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: "Current in Galley Pad" })).toHaveTextContent("Local");
    expect(screen.getByRole("region", { name: "Incoming from disk" })).toHaveTextContent("External");
    expect(screen.getAllByTestId("diff-row-changed")).toHaveLength(2);
  });

  it("calls actions from the reconcile toolbar", () => {
    const onReload = vi.fn();
    const onSaveAs = vi.fn();
    render(
      <ExternalReconcileView
        title="notes.md"
        currentLabel="Current"
        incomingLabel="Incoming"
        currentContent="Local\n"
        incomingContent="Incoming\n"
        onClose={vi.fn()}
        onReload={onReload}
        onSaveAs={onSaveAs}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reload from disk" }));
    fireEvent.click(screen.getByRole("button", { name: "Save my changes as..." }));
    expect(onReload).toHaveBeenCalledOnce();
    expect(onSaveAs).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run test:unit -- src/components/ExternalReconcileView.test.tsx
```

Expected: fails because the component does not exist.

- [ ] **Step 3: Implement reconcile view**

Create `src/components/ExternalReconcileView.tsx`:

```tsx
import { useMemo, useRef } from "react";
import { createSideBySideLineDiff } from "../document/diff";

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
    if (syncing.current) return;
    const from = source === "left" ? leftRef.current : rightRef.current;
    const to = source === "left" ? rightRef.current : leftRef.current;
    if (!from || !to) return;
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
          <button type="button" className="button-secondary" onClick={onClose}>Back to editor</button>
          <button type="button" className="button-secondary" onClick={onSaveAs}>Save my changes as...</button>
          <button type="button" className="button-danger" onClick={onReload}>Reload from disk</button>
        </div>
      </header>
      <div className="external-reconcile-grid">
        <DiffPane label={currentLabel} side="left" rows={rows} paneRef={leftRef} onScroll={() => syncScroll("left")} />
        <DiffPane label={incomingLabel} side="right" rows={rows} paneRef={rightRef} onScroll={() => syncScroll("right")} />
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
  rows: ReturnType<typeof createSideBySideLineDiff>;
  paneRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}) {
  return (
    <section className="external-reconcile-pane" role="region" aria-label={label}>
      <h3>{label}</h3>
      <div className="external-reconcile-editor" ref={paneRef} onScroll={onScroll}>
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
```

- [ ] **Step 4: Verify and commit**

```bash
npm run test:unit -- src/components/ExternalReconcileView.test.tsx
git add src/components/ExternalReconcileView.tsx src/components/ExternalReconcileView.test.tsx
git commit -m "feat(app): add external reconcile view"
```

## Task 7: App Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write failing app tests**

Add tests covering:

```ts
it("shows a banner for a clean external update and opens reconcile on request", async () => {
  window.history.replaceState(null, "", "/?open=/tmp/opened.md");
  readTextFileMock
    .mockResolvedValueOnce({ path: "/tmp/opened.md", content: "Base\n", lineEnding: "lf", lastModifiedAt: 10 })
    .mockResolvedValueOnce({ path: "/tmp/opened.md", content: "Incoming\n", lineEnding: "lf", lastModifiedAt: 12 });

  render(<App />);
  await waitFor(() => expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue("Base\n"));

  act(() => window.dispatchEvent(new Event("focus")));
  await screen.findByRole("status", { name: "External file update" });
  expect(screen.queryByRole("region", { name: "Disk changes" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Reconcile" }));
  expect(await screen.findByRole("region", { name: "Incoming from disk" })).toHaveTextContent("Incoming");
  expect(screen.getByRole("region", { name: "Current in Galley Pad" })).toHaveTextContent("Base");
});

it("shows a banner when an open file was deleted on disk", async () => {
  window.history.replaceState(null, "", "/?open=/tmp/deleted.md");
  readTextFileMock
    .mockResolvedValueOnce({ path: "/tmp/deleted.md", content: "Loaded\n", lineEnding: "lf", lastModifiedAt: 10 })
    .mockResolvedValueOnce({ path: "/tmp/deleted.md", content: "", lineEnding: "lf", lastModifiedAt: null });

  render(<App />);
  await waitFor(() => expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue("Loaded\n"));

  act(() => window.dispatchEvent(new Event("focus")));
  expect(await screen.findByRole("status", { name: "External file deletion" })).toHaveTextContent("deleted.md was deleted on disk.");
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run test:unit -- src/App.test.tsx --testNamePattern "external update|deleted on disk"
```

Expected: fails because app integration is missing.

- [ ] **Step 3: Wire state and checks**

In `src/App.tsx`, import `ExternalFileBanner`, `ExternalReconcileView`, `checkExternalFileChange`, session helpers, and `ExternalFileChangeResult`.

Add state:

```ts
type ExternalFileWarning =
  | { kind: "clean-update"; tabId: string; result: Extract<ExternalFileChangeResult, { kind: "clean-update" }> }
  | { kind: "conflict"; tabId: string; result: Extract<ExternalFileChangeResult, { kind: "conflict" }> }
  | { kind: "deleted"; tabId: string; result: Extract<ExternalFileChangeResult, { kind: "deleted" }> };

const [externalFileWarning, setExternalFileWarning] =
  useState<ExternalFileWarning | null>(null);
const [reconcileOpen, setReconcileOpen] = useState(false);
const externalCheckChain = useRef<Promise<void>>(Promise.resolve());
```

Add focus/visibility and tab-selection checks. `selectDocumentTab` should call `enqueueExternalFileChecks([tabId])` after activating the tab.

Implement helpers:

```ts
function updateWorkspaceNow(update: (workspace: DocumentWorkspace) => DocumentWorkspace) {
  setWorkspace((current) => {
    const next = update(current);
    latestWorkspace.current = next;
    return next;
  });
}

function enqueueExternalFileChecks(tabIds: string[]) {
  externalCheckChain.current = externalCheckChain.current.then(async () => {
    for (const tabId of tabIds) {
      await checkExternalFileForTab(tabId);
    }
  });
}

async function checkExternalFileForTab(tabId: string) {
  const tab = latestWorkspace.current.tabs.find((candidate) => candidate.id === tabId);
  if (!tab?.session.path || closingRef.current) return;

  try {
    const result = await checkExternalFileChange(tab.session, dependencies);
    if (result.kind === "unchanged") return;
    if (result.kind === "metadata-refresh") {
      updateWorkspaceNow((current) => updateDocumentTab(current, tabId, () => result.session));
      return;
    }
    if (result.kind === "clean-update" && result.session.externalUpdatePolicy === "follow") {
      applyExternalReloadToTab(tabId, result.session, result.external);
      return;
    }
    setExternalFileWarning({ kind: result.kind, tabId, result } as ExternalFileWarning);
    setReconcileOpen(false);
  } catch (error: unknown) {
    setCommandError(errorMessage(error));
  }
}
```

Render order:

- command error slot
- `ExternalFileBanner` when `externalFileWarning` exists and `reconcileOpen` is false
- `ExternalReconcileView` when `externalFileWarning` is `clean-update` or `conflict` and `reconcileOpen` is true
- otherwise `DocumentView`

Banner actions:

- clean `Reload`: apply external reload and clear warning.
- clean `Follow updates`: apply external reload, set policy to `follow`, clear warning.
- clean `Keep asking`: mark external mtime noticed and clear warning.
- conflict `Keep editing`: mark external mtime noticed and clear warning.
- conflict `Reload from disk`: apply external reload and clear warning.
- conflict `Save my changes as...`: call existing Save As flow for that tab.
- deleted `Keep editing`: clear warning.
- deleted `Save As`: call existing Save As flow for that tab.
- `Reconcile`: set `reconcileOpen` true.

- [ ] **Step 4: Verify and commit**

```bash
npm run test:unit -- src/App.test.tsx --testNamePattern "external update|deleted on disk"
git add src/App.tsx src/App.test.tsx
git commit -m "feat(app): handle external file warnings"
```

## Task 8: Styling

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add banner and reconcile styles**

Add CSS for `.external-file-banner`, `.external-file-banner-actions`, `.external-reconcile`, `.external-reconcile-toolbar`, `.external-reconcile-grid`, `.external-reconcile-pane`, `.external-reconcile-editor`, and `.external-reconcile-line-*`.

Use full-width unframed layout inside the app shell. The banner should be compact and non-modal. The reconcile view should fill the document area with two equal-width panes, stable line height, independent scroll containers, and synchronized scrolling handled by the component.

Concrete CSS:

```css
.external-file-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-panel) 92%, var(--ge-color-link, #4f7cff));
}

.external-file-banner-warning {
  background: color-mix(in srgb, var(--app-panel) 88%, var(--ge-color-token-heading, #b14c4c));
}

.external-file-banner p {
  margin: 3px 0 0;
  color: var(--app-muted);
}

.external-file-banner-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.external-reconcile {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
  height: 100%;
}

.external-reconcile-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--app-border);
}

.external-reconcile-toolbar h2 {
  margin: 0;
  font-size: 1rem;
}

.external-reconcile-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  min-height: 0;
}

.external-reconcile-pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  border-right: 1px solid var(--app-border);
}

.external-reconcile-pane:last-child {
  border-right: 0;
}

.external-reconcile-pane h3 {
  margin: 0;
  padding: 8px 12px;
  font-size: 0.82rem;
  border-bottom: 1px solid var(--app-border);
}

.external-reconcile-editor {
  min-height: 0;
  overflow: auto;
  font-family: var(--ge-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.88rem;
  line-height: 1.5;
}

.external-reconcile-line {
  display: grid;
  grid-template-columns: 4ch minmax(0, 1fr);
  gap: 10px;
  min-height: 1.5em;
  padding: 0 12px;
}

.external-reconcile-line code {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: inherit;
}

.external-reconcile-line-number {
  color: var(--app-muted);
  text-align: right;
  user-select: none;
}

.external-reconcile-line-added,
.external-reconcile-line-changed {
  background: color-mix(in srgb, var(--ge-color-token-string, #2f8f46) 16%, transparent);
}

.external-reconcile-line-removed {
  background: color-mix(in srgb, var(--ge-color-token-heading, #b14c4c) 16%, transparent);
}
```

- [ ] **Step 2: Verify and commit**

```bash
npm run test:unit -- src/components/ExternalFileBanner.test.tsx src/components/ExternalReconcileView.test.tsx src/App.test.tsx
git add src/styles.css
git commit -m "style(app): add external warning and reconcile styles"
```

## Task 9: Browser Integration Coverage

**Files:**
- Modify: `tests/integration/app.spec.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add integration test**

Add:

```ts
test("shows external update banner and opens reconcile view", async ({ page }) => {
  await page.goto("/");

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("galley-pad-test-external-update", {
        detail: {
          displayName: "notes.md",
          current: "Current\n",
          incoming: "Incoming\n",
        },
      }),
    );
  });

  await expect(page.getByRole("status", { name: "External file update" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Incoming from disk" })).not.toBeVisible();

  await page.getByRole("button", { name: "Reconcile" }).click();
  await expect(page.getByRole("region", { name: "Current in Galley Pad" })).toContainText("Current");
  await expect(page.getByRole("region", { name: "Incoming from disk" })).toContainText("Incoming");
});
```

- [ ] **Step 2: Add guarded test hook**

Add this `import.meta.env.PROD` guarded event listener in `App.tsx` after the other external-file effects. It must not run in production builds.

```ts
useEffect(() => {
  if (import.meta.env.PROD) {
    return;
  }

  function handleTestExternalUpdate(event: Event) {
    const detail = (event as CustomEvent).detail;
    if (!detail || typeof detail !== "object") {
      return;
    }

    const current =
      typeof detail.current === "string" ? detail.current : "Current\n";
    const incoming =
      typeof detail.incoming === "string" ? detail.incoming : "Incoming\n";
    const displayName =
      typeof detail.displayName === "string" ? detail.displayName : "notes.md";
    const session: DocumentSession = {
      ...createUntitledSession(),
      id: "file:/tmp/test-external-update.md",
      path: "/tmp/test-external-update.md",
      displayName,
      content: current,
      savedContent: current,
      dirty: false,
      lastKnownModifiedAt: 1,
    };

    setExternalFileWarning({
      kind: "clean-update",
      tabId: latestWorkspace.current.activeTabId,
      result: {
        kind: "clean-update",
        session,
        external: {
          path: "/tmp/test-external-update.md",
          content: incoming,
          lineEnding: "lf",
          lastModifiedAt: 2,
        },
      },
    });
    setReconcileOpen(false);
  }

  window.addEventListener("galley-pad-test-external-update", handleTestExternalUpdate);
  return () => {
    window.removeEventListener("galley-pad-test-external-update", handleTestExternalUpdate);
  };
}, []);
```

Add `createUntitledSession` to the session imports in `src/App.tsx`:

```ts
import {
  createUntitledSession,
  updateSessionContent,
  type DocumentSession,
} from "./document/session";
```

- [ ] **Step 3: Verify and commit**

```bash
npm run test:integration -- tests/integration/app.spec.ts
git add src/App.tsx tests/integration/app.spec.ts
git commit -m "test(app): cover external reconcile flow"
```

## Task 10: Full Verification

**Files:**
- No planned source changes.

- [ ] **Step 1: Run focused unit tests**

```bash
npm run test:unit -- src/document/session.test.ts src/document/lifecycle.test.ts src/document/diff.test.ts src/components/ExternalFileBanner.test.tsx src/components/ExternalReconcileView.test.tsx src/App.test.tsx
```

Expected: all selected tests pass.

- [ ] **Step 2: Run integration tests**

```bash
npm run test:integration
```

Expected: Playwright tests pass.

- [ ] **Step 3: Run Rust tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: Rust tests pass. Existing unused import warnings in `src-tauri/src/lib.rs` may appear and are outside this feature.

- [ ] **Step 4: Run full verification**

```bash
mise run verify
```

Expected: full verification passes. If `tauri info` times out with exit code 124, follow `AGENTS.md`: continue with the Tauri build result and record the timeout in the final handoff.

- [ ] **Step 5: Confirm branch status**

```bash
git status --short --branch
```

Expected: branch `feat/external-file-updates` has no unstaged tracked changes. Existing unrelated untracked plan files may still be present and should remain untouched unless the user explicitly asks to handle them.

## Implementation Notes

- Banners must not contain diffs.
- Diffs are shown only after the user chooses `Reconcile`.
- Reconcile is a side-by-side view, not a modal.
- Modals/dialogs remain for critical blocking decisions only.
- Do not persist `externalUpdatePolicy` or `lastNoticedExternalModifiedAt` to app settings.
- Swap restoration must reset external update runtime fields to `ask` and `null`.
- Do not add filesystem watchers in this implementation.
- Do not implement automatic merge.
- Save must never silently overwrite an externally changed file.
