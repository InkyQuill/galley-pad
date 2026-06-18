# File Command UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first user-visible file lifecycle commands: New, Open, Save, and Save As for a single Markdown document.

**Architecture:** Keep file I/O in Tauri commands and keep native file picking in the Tauri dialog plugin. Add a small TypeScript lifecycle module that composes typed Tauri wrappers into testable document commands, then wire those commands into the React app shell with compact controls and status/error feedback.

**Tech Stack:** Tauri 2, `@tauri-apps/plugin-dialog`, React 18, TypeScript 6, Vitest, Playwright, Rust tests.

---

## Scope

This plan implements:

- New document command.
- Open document command through a native file picker.
- Save command for file-backed documents.
- Save As command through a native save picker.
- Dirty replacement confirmation before New/Open.
- Conservative external-change protection before Save.
- Window title updates with document name and dirty marker.
- Unit and integration coverage for the new behavior.

This plan does not implement:

- Native application menus.
- Global keyboard shortcuts.
- Native close interception.
- CLI file argument opening.
- Recent files.
- Drag-and-drop file opening.
- File associations.
- Rich external conflict resolution or reload.

## Current Context

Stage 2 foundation is already merged:

- `src/document/session.ts` defines `DocumentSession`, `createUntitledSession`, `createSessionFromFile`, `updateSessionContent`, and `markSessionSaved`.
- `src/tauri/files.ts` wraps `read_text_file` and `write_text_file`.
- `src-tauri/src/lib.rs` exposes read/write text file Tauri commands and public helper functions for Rust integration tests.
- `src/App.tsx` owns a single `DocumentSession` and tracks dirty state from Galley Editor changes.

Tauri dialog plugin reference:

- Use `@tauri-apps/plugin-dialog` JavaScript `open()` and `save()` for file picker paths.
- Register `tauri_plugin_dialog::init()` in Rust.
- Add dialog permissions to `src-tauri/capabilities/default.json`.
- Official docs: https://v2.tauri.app/plugin/dialog/

## File Structure

- Modify: `package.json` / `package-lock.json` - add latest `@tauri-apps/plugin-dialog`.
- Modify: `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock` - add latest `tauri-plugin-dialog`.
- Modify: `src-tauri/src/lib.rs` - register the dialog plugin.
- Modify: `src-tauri/capabilities/default.json` - allow dialog open/save APIs.
- Create: `src/tauri/dialogs.ts` - typed wrappers for Markdown open/save dialogs.
- Create: `src/tauri/dialogs.test.ts` - wrapper tests for dialog options and cancel behavior.
- Create: `src/document/lifecycle.ts` - pure document command flows.
- Create: `src/document/lifecycle.test.ts` - unit tests for New/Open/Save/Save As, cancellation, and external-change protection.
- Modify: `src/App.tsx` - command toolbar, command wiring, dirty replacement confirmation, error/status handling, and window title updates.
- Modify: `src/App.test.tsx` - app command tests with mocked Tauri wrappers.
- Modify: `src/styles.css` - compact command bar and error/status styling without changing editor full-window behavior.
- Modify: `tests/integration/app.spec.ts` - browser coverage for visible controls and New behavior.
- Modify: `src-tauri/tests/scaffold.rs` - keep Rust file command integration coverage passing.

---

### Task 1: Install And Register Dialog Plugin

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [x] **Step 1: Install the latest dialog packages**

Run:

```bash
npm install @tauri-apps/plugin-dialog@latest
cargo add tauri-plugin-dialog@latest --manifest-path src-tauri/Cargo.toml
```

Expected:

```txt
package.json and package-lock.json include @tauri-apps/plugin-dialog
src-tauri/Cargo.toml and src-tauri/Cargo.lock include tauri-plugin-dialog
```

- [x] **Step 2: Register the Rust plugin**

In `src-tauri/src/lib.rs`, update the builder in `run()` so it includes the dialog plugin before the invoke handler:

```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_text_file, write_text_file])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| panic!("error while running {}: {error}", app_title()));
```

- [x] **Step 3: Allow dialog permissions**

Replace `src-tauri/capabilities/default.json` with:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default permissions for the main Galley Pad window.",
  "windows": ["main"],
  "permissions": ["core:default", "dialog:allow-open", "dialog:allow-save"]
}
```

- [x] **Step 4: Verify Rust plugin registration compiles**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected:

```txt
Rust unit tests pass
Rust integration test text_file_commands_round_trip_markdown_content passes
```

- [x] **Step 5: Verify frontend dependencies resolve**

Run:

```bash
npm run build
```

Expected:

```txt
TypeScript compiles
Vite production build completes
```

- [x] **Step 6: Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat: add native dialog plugin"
```

---

### Task 2: Add Typed Dialog Wrappers

**Files:**
- Create: `src/tauri/dialogs.ts`
- Create: `src/tauri/dialogs.test.ts`

- [x] **Step 1: Write failing dialog wrapper tests**

Create `src/tauri/dialogs.test.ts`:

```ts
import { open, save } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pickOpenFile, pickSaveFile } from "./dialogs";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

const openMock = vi.mocked(open);
const saveMock = vi.mocked(save);

describe("dialog wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a single Markdown-compatible file picker", async () => {
    openMock.mockResolvedValue("/tmp/draft.md");

    await expect(pickOpenFile()).resolves.toBe("/tmp/draft.md");

    expect(openMock).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Markdown and text",
          extensions: ["md", "markdown", "txt"],
        },
      ],
    });
  });

  it("treats cancelled or multi-select open results as no selection", async () => {
    openMock.mockResolvedValueOnce(null);
    await expect(pickOpenFile()).resolves.toBeNull();

    openMock.mockResolvedValueOnce(["/tmp/a.md", "/tmp/b.md"]);
    await expect(pickOpenFile()).resolves.toBeNull();
  });

  it("opens a Markdown-compatible save picker with a default path", async () => {
    saveMock.mockResolvedValue("/tmp/saved.md");

    await expect(pickSaveFile("Untitled.md")).resolves.toBe("/tmp/saved.md");

    expect(saveMock).toHaveBeenCalledWith({
      defaultPath: "Untitled.md",
      filters: [
        {
          name: "Markdown",
          extensions: ["md", "markdown"],
        },
        {
          name: "Text",
          extensions: ["txt"],
        },
      ],
    });
  });

  it("omits defaultPath when Save As has no useful default", async () => {
    saveMock.mockResolvedValue(null);

    await expect(pickSaveFile(null)).resolves.toBeNull();

    expect(saveMock).toHaveBeenCalledWith({
      filters: [
        {
          name: "Markdown",
          extensions: ["md", "markdown"],
        },
        {
          name: "Text",
          extensions: ["txt"],
        },
      ],
    });
  });
});
```

- [x] **Step 2: Run the failing tests**

Run:

```bash
npm run test:unit -- src/tauri/dialogs.test.ts
```

Expected:

```txt
FAIL because src/tauri/dialogs.ts does not exist
```

- [x] **Step 3: Create `src/tauri/dialogs.ts`**

```ts
import { open, save } from "@tauri-apps/plugin-dialog";

const openFilters = [
  {
    name: "Markdown and text",
    extensions: ["md", "markdown", "txt"],
  },
];

const saveFilters = [
  {
    name: "Markdown",
    extensions: ["md", "markdown"],
  },
  {
    name: "Text",
    extensions: ["txt"],
  },
];

export async function pickOpenFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: openFilters,
  });

  return typeof selected === "string" ? selected : null;
}

export async function pickSaveFile(
  defaultPath: string | null,
): Promise<string | null> {
  const options =
    defaultPath && defaultPath.trim()
      ? { defaultPath, filters: saveFilters }
      : { filters: saveFilters };

  return save(options);
}
```

- [x] **Step 4: Run wrapper tests**

Run:

```bash
npm run test:unit -- src/tauri/dialogs.test.ts
```

Expected:

```txt
4 tests pass
```

- [x] **Step 5: Commit**

```bash
git add src/tauri/dialogs.ts src/tauri/dialogs.test.ts
git commit -m "feat: add typed dialog wrappers"
```

---

### Task 3: Add Testable Document Lifecycle Commands

**Files:**
- Create: `src/document/lifecycle.ts`
- Create: `src/document/lifecycle.test.ts`

- [x] **Step 1: Write failing lifecycle tests**

Create `src/document/lifecycle.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  createSessionFromFile,
  createUntitledSession,
  updateSessionContent,
} from "./session";
import {
  ExternalFileChangedError,
  createLifecycleDependencies,
  newDocument,
  openDocument,
  saveDocument,
  saveDocumentAs,
} from "./lifecycle";

describe("document lifecycle commands", () => {
  it("creates a fresh untitled document", () => {
    const dirty = updateSessionContent(createUntitledSession(), "Changed");

    expect(newDocument(dirty)).toMatchObject({
      id: "untitled",
      path: null,
      displayName: "Untitled.md",
      dirty: false,
    });
  });

  it("opens a selected file as a clean document session", async () => {
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn().mockResolvedValue("/tmp/opened.md"),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/opened.md",
        content: "# Opened\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(openDocument(deps)).resolves.toMatchObject({
      id: "file:/tmp/opened.md",
      path: "/tmp/opened.md",
      displayName: "opened.md",
      content: "# Opened\n",
      savedContent: "# Opened\n",
      dirty: false,
      lastKnownModifiedAt: 10,
    });
  });

  it("keeps the current session when Open is cancelled", async () => {
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn().mockResolvedValue(null),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(),
    });

    await expect(openDocument(deps)).resolves.toBeNull();
    expect(deps.readTextFile).not.toHaveBeenCalled();
  });

  it("saves a file-backed document when the file has not changed externally", async () => {
    const session = updateSessionContent(
      createSessionFromFile({
        path: "/tmp/draft.md",
        content: "# Draft\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      }),
      "# Draft\n\nUpdated.\n",
    );
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/draft.md",
        content: "# Draft\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      }),
      writeTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/draft.md",
        lineEnding: "lf",
        lastModifiedAt: 11,
      }),
    });

    await expect(saveDocument(session, deps)).resolves.toMatchObject({
      path: "/tmp/draft.md",
      savedContent: "# Draft\n\nUpdated.\n",
      dirty: false,
      lastKnownModifiedAt: 11,
    });
    expect(deps.writeTextFile).toHaveBeenCalledWith(
      "/tmp/draft.md",
      "# Draft\n\nUpdated.\n",
    );
  });

  it("routes Save for untitled documents through Save As", async () => {
    const session = updateSessionContent(createUntitledSession(), "# Saved\n");
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn().mockResolvedValue("/tmp/new.md"),
      readTextFile: vi.fn(),
      writeTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/new.md",
        lineEnding: "lf",
        lastModifiedAt: 20,
      }),
    });

    await expect(saveDocument(session, deps)).resolves.toMatchObject({
      path: "/tmp/new.md",
      displayName: "new.md",
      dirty: false,
    });
    expect(deps.pickSaveFile).toHaveBeenCalledWith("Untitled.md");
  });

  it("returns null when Save As is cancelled", async () => {
    const session = updateSessionContent(createUntitledSession(), "# Unsaved\n");
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn().mockResolvedValue(null),
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(),
    });

    await expect(saveDocumentAs(session, deps)).resolves.toBeNull();
    expect(deps.writeTextFile).not.toHaveBeenCalled();
  });

  it("blocks Save when the file changed on disk after it was opened", async () => {
    const session = updateSessionContent(
      createSessionFromFile({
        path: "/tmp/conflict.md",
        content: "# Original\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      }),
      "# Local edit\n",
    );
    const deps = createLifecycleDependencies({
      pickOpenFile: vi.fn(),
      pickSaveFile: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue({
        path: "/tmp/conflict.md",
        content: "# External edit\n",
        lineEnding: "lf",
        lastModifiedAt: 12,
      }),
      writeTextFile: vi.fn(),
    });

    await expect(saveDocument(session, deps)).rejects.toBeInstanceOf(
      ExternalFileChangedError,
    );
    expect(deps.writeTextFile).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run the failing lifecycle tests**

Run:

```bash
npm run test:unit -- src/document/lifecycle.test.ts
```

Expected:

```txt
FAIL because src/document/lifecycle.ts does not exist
```

- [x] **Step 3: Create `src/document/lifecycle.ts`**

```ts
import {
  createSessionFromFile,
  createUntitledSession,
  markSessionSaved,
  type DocumentSession,
  type FileReadResult,
  type FileWriteResult,
} from "./session";

export class ExternalFileChangedError extends Error {
  constructor(path: string) {
    super(
      `The file changed on disk since it was opened: ${path}. Use Save As to avoid overwriting external changes.`,
    );
    this.name = "ExternalFileChangedError";
  }
}

export type LifecycleDependencies = {
  pickOpenFile: () => Promise<string | null>;
  pickSaveFile: (defaultPath: string | null) => Promise<string | null>;
  readTextFile: (path: string) => Promise<FileReadResult>;
  writeTextFile: (
    path: string,
    content: string,
  ) => Promise<FileWriteResult>;
};

export function createLifecycleDependencies(
  dependencies: LifecycleDependencies,
): LifecycleDependencies {
  return dependencies;
}

export function newDocument(_current: DocumentSession): DocumentSession {
  return createUntitledSession();
}

export async function openDocument(
  dependencies: LifecycleDependencies,
): Promise<DocumentSession | null> {
  const path = await dependencies.pickOpenFile();
  if (!path) {
    return null;
  }

  return createSessionFromFile(await dependencies.readTextFile(path));
}

export async function saveDocument(
  session: DocumentSession,
  dependencies: LifecycleDependencies,
): Promise<DocumentSession | null> {
  if (!session.path) {
    return saveDocumentAs(session, dependencies);
  }

  await assertFileUnchanged(session, dependencies);

  return markSessionSaved(
    session,
    await dependencies.writeTextFile(session.path, session.content),
  );
}

export async function saveDocumentAs(
  session: DocumentSession,
  dependencies: LifecycleDependencies,
): Promise<DocumentSession | null> {
  const path = await dependencies.pickSaveFile(session.path ?? session.displayName);
  if (!path) {
    return null;
  }

  return markSessionSaved(
    session,
    await dependencies.writeTextFile(path, session.content),
  );
}

async function assertFileUnchanged(
  session: DocumentSession,
  dependencies: LifecycleDependencies,
): Promise<void> {
  if (!session.path || session.lastKnownModifiedAt === null) {
    return;
  }

  const current = await dependencies.readTextFile(session.path);
  if (
    current.lastModifiedAt !== null &&
    current.lastModifiedAt !== session.lastKnownModifiedAt
  ) {
    throw new ExternalFileChangedError(session.path);
  }
}
```

- [x] **Step 4: Run lifecycle tests**

Run:

```bash
npm run test:unit -- src/document/lifecycle.test.ts
```

Expected:

```txt
7 tests pass
```

- [x] **Step 5: Commit**

```bash
git add src/document/lifecycle.ts src/document/lifecycle.test.ts
git commit -m "feat: add document lifecycle commands"
```

---

### Task 4: Wire Commands Into The App Shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

- [x] **Step 1: Replace App tests with command coverage**

Replace `src/App.test.tsx` with:

```ts
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { pickOpenFile, pickSaveFile } from "./tauri/dialogs";
import { readTextFile, writeTextFile } from "./tauri/files";

vi.mock("@inky/galley-editor", () => import("./test/galley-editor.mock"));
vi.mock("./tauri/dialogs", () => ({
  pickOpenFile: vi.fn(),
  pickSaveFile: vi.fn(),
}));
vi.mock("./tauri/files", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

const pickOpenFileMock = vi.mocked(pickOpenFile);
const pickSaveFileMock = vi.mocked(pickSaveFile);
const readTextFileMock = vi.mocked(readTextFile);
const writeTextFileMock = vi.mocked(writeTextFile);

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    document.title = "";
  });

  it("renders the single-document editor shell with file commands", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save As" })).toBeInTheDocument();
    expect(screen.getByText("Untitled.md")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(
      screen.getByRole("main", { name: "Markdown document editor" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "# Untitled\n\nStart writing Markdown.\n",
    );
    expect(screen.getByLabelText("Document statistics")).toHaveTextContent(
      "4 words",
    );
    expect(document.title).toBe("Untitled.md - Galley Pad");
  });

  it("marks the session dirty when editor content changes and updates the title", () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "One two three" },
    });

    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    expect(screen.getByLabelText("Document statistics")).toHaveTextContent(
      "3 words",
    );
    expect(document.title).toBe("* Untitled.md - Galley Pad");
  });

  it("creates a new document after confirming dirty replacement", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "Dirty draft" },
    });

    fireEvent.click(screen.getByRole("button", { name: "New" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "Discard unsaved changes to Untitled.md?",
    );
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "# Untitled\n\nStart writing Markdown.\n",
    );
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("keeps the dirty document when New replacement is cancelled", () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<App />);
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "Dirty draft" },
    });

    fireEvent.click(screen.getByRole("button", { name: "New" }));

    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "Dirty draft",
    );
    expect(screen.getByText("Unsaved")).toBeInTheDocument();
  });

  it("opens a selected file and updates the session", async () => {
    pickOpenFileMock.mockResolvedValue("/tmp/opened.md");
    readTextFileMock.mockResolvedValue({
      path: "/tmp/opened.md",
      content: "# Opened\n",
      lineEnding: "lf",
      lastModifiedAt: 10,
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByText("opened.md")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue("# Opened\n");
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(document.title).toBe("opened.md - Galley Pad");
  });

  it("saves a dirty file-backed document", async () => {
    pickOpenFileMock.mockResolvedValue("/tmp/opened.md");
    readTextFileMock
      .mockResolvedValueOnce({
        path: "/tmp/opened.md",
        content: "# Opened\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      })
      .mockResolvedValueOnce({
        path: "/tmp/opened.md",
        content: "# Opened\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      });
    writeTextFileMock.mockResolvedValue({
      path: "/tmp/opened.md",
      lineEnding: "lf",
      lastModifiedAt: 11,
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByText("opened.md");
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "# Opened\n\nUpdated.\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(writeTextFileMock).toHaveBeenCalledWith(
        "/tmp/opened.md",
        "# Opened\n\nUpdated.\n",
      );
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("saves an untitled document through Save As", async () => {
    pickSaveFileMock.mockResolvedValue("/tmp/new.md");
    writeTextFileMock.mockResolvedValue({
      path: "/tmp/new.md",
      lineEnding: "lf",
      lastModifiedAt: 20,
    });
    render(<App />);
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "# New content\n" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(writeTextFileMock).toHaveBeenCalledWith(
        "/tmp/new.md",
        "# New content\n",
      );
    });
    expect(screen.getByText("new.md")).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("shows an error when Save detects an external file change", async () => {
    pickOpenFileMock.mockResolvedValue("/tmp/opened.md");
    readTextFileMock
      .mockResolvedValueOnce({
        path: "/tmp/opened.md",
        content: "# Opened\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      })
      .mockResolvedValueOnce({
        path: "/tmp/opened.md",
        content: "# External\n",
        lineEnding: "lf",
        lastModifiedAt: 99,
      });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByText("opened.md");
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "# Local\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await expect(
      screen.findByRole("alert", { name: "File command error" }),
    ).resolves.toHaveTextContent("Use Save As to avoid overwriting");
    expect(writeTextFileMock).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run the failing App tests**

Run:

```bash
npm run test:unit -- src/App.test.tsx
```

Expected:

```txt
FAIL because command buttons and command wiring do not exist
```

- [x] **Step 3: Replace `src/App.tsx`**

```tsx
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

  async function runCommand(
    name: CommandName,
    command: () => Promise<DocumentSession | null> | DocumentSession | null,
  ) {
    setCommandError(null);
    setPendingCommand(name);

    try {
      const next = await command();
      if (next) {
        setDocument(next);
      }
    } catch (error) {
      setCommandError(errorMessage(error));
    } finally {
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
          onClick={() => runCommand("Save", () => saveDocument(document, dependencies))}
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
```

- [x] **Step 4: Update app shell CSS**

In `src/styles.css`, change the app grid and add command styles.

Replace:

```css
.app-shell {
  display: grid;
  grid-template-rows: 44px minmax(0, 1fr);
  width: 100%;
  height: 100%;
  background: #f6f4ef;
  color: #1f2523;
}
```

With:

```css
.app-shell {
  display: grid;
  grid-template-rows: 44px 40px auto minmax(0, 1fr);
  width: 100%;
  height: 100%;
  background: #f6f4ef;
  color: #1f2523;
}
```

Add after `.document-meta`:

```css
.commandbar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px 12px;
  border-bottom: 1px solid #ded8cb;
  background: #f7f4ee;
}

.commandbar button {
  min-width: 64px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid #c7c0b3;
  border-radius: 6px;
  background: #fffdf8;
  color: #1f2523;
  font-size: 12px;
  font-weight: 600;
}

.commandbar button:disabled {
  color: #8b928f;
  cursor: wait;
}

.command-status {
  min-width: 72px;
  color: #69726e;
  font-size: 12px;
}

.command-error {
  padding: 8px 12px;
  border-bottom: 1px solid #e2b8ad;
  background: #fff1ed;
  color: #7a2317;
  font-size: 12px;
}
```

Inside the existing dark-mode block, add:

```css
  .commandbar {
    border-bottom-color: #343936;
    background: #1d211f;
  }

  .commandbar button {
    border-color: #4a504c;
    background: #252a27;
    color: #f1ece3;
  }

  .commandbar button:disabled,
  .command-status {
    color: #8e9793;
  }

  .command-error {
    border-bottom-color: #63352d;
    background: #321f1b;
    color: #ffb8a8;
  }
```

- [x] **Step 5: Run App unit tests**

Run:

```bash
npm run test:unit -- src/App.test.tsx src/document/lifecycle.test.ts src/tauri/dialogs.test.ts
```

Expected:

```txt
App command tests pass
lifecycle tests pass
dialog wrapper tests pass
```

- [x] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: wire file commands into app shell"
```

---

### Task 5: Browser Integration Coverage

**Files:**
- Modify: `tests/integration/app.spec.ts`

- [x] **Step 1: Add browser coverage for the visible command bar and New flow**

Append this test to `tests/integration/app.spec.ts`:

```ts
test("shows file commands and creates a fresh document", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "New" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save As" })).toBeVisible();

  await page.locator(".cm-content").click();
  await page.keyboard.type("\nTemporary draft");
  await expect(page.getByText("Unsaved")).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe("Discard unsaved changes to Untitled.md?");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "New" }).click();

  await expect(page.getByText("Draft")).toBeVisible();
  await expect(page.getByText("Unsaved")).not.toBeVisible();
  await expect(page.getByLabel("Document statistics")).toHaveText("4 words");
});
```

- [x] **Step 2: Run browser integration tests**

Run:

```bash
npm run test:integration
```

Expected:

```txt
All Playwright tests pass
```

- [x] **Step 3: Commit**

```bash
git add tests/integration/app.spec.ts
git commit -m "test: cover file command browser flow"
```

---

### Task 6: Final Verification

**Files:**
- Inspect: `src/App.tsx`
- Inspect: `src/document/lifecycle.ts`
- Inspect: `src/tauri/dialogs.ts`
- Inspect: `src-tauri/src/lib.rs`
- Inspect: `src-tauri/capabilities/default.json`

- [x] **Step 1: Run all unit tests**

Run:

```bash
npm run test:unit
```

Expected:

```txt
All Vitest test files pass
```

- [x] **Step 2: Run browser integration tests**

Run:

```bash
npm run test:integration
```

Expected:

```txt
All Playwright tests pass
```

- [x] **Step 3: Run frontend build**

Run:

```bash
npm run build
```

Expected:

```txt
TypeScript and Vite production build pass
```

- [x] **Step 4: Run Rust formatting and tests**

Run:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected:

```txt
Rust formatting passes
Rust unit and integration tests pass
```

- [x] **Step 5: Run Tauri metadata and debug build checks**

Run:

```bash
node scripts/tauri-info.mjs
node scripts/with-timeout.mjs 120 npm run tauri -- build --debug --no-bundle
```

Expected:

```txt
tauri info completes or times out with the documented known-issue handling
Tauri debug build passes
```

- [x] **Step 6: Attempt full verify**

Run:

```bash
mise run verify
```

Expected if npm audit is available:

```txt
npm audit reports 0 vulnerabilities
unit tests pass
browser integration tests pass
frontend build passes
Rust fmt check passes
Rust tests pass
Tauri debug build passes
```

If the npm registry audit endpoint returns an error before local checks run, retry `npm audit --json` once. If it still fails with a registry endpoint error, document the external failure in the PR and rely on Steps 1-5 for local verification evidence.

Observed during implementation: `mise run verify` stopped at `npm audit --json` because the npm registry audit endpoint returned an error before local checks ran. A standalone `npm audit --json` retry failed the same way. Steps 1-5 were run directly and passed.

- [x] **Step 7: Confirm this slice stops at the intended boundary**

Run:

```bash
rg -n "recent|drag|argv|close confirmation|set_menu|MenuBuilder|globalShortcut|file association" src src-tauri/src src-tauri/tests src-tauri/Cargo.toml src-tauri/tauri.conf.json
```

Expected:

```txt
No recent-file, drag-and-drop, CLI argv, native close-confirmation, native menu, global shortcut, or file-association implementation appears in this slice.
```

- [x] **Step 8: Commit verification-only cleanup**

If only plan checkboxes changed, commit them:

```bash
git add docs/superpowers/plans/2026-06-18-file-command-ui.md
git commit -m "docs: complete file command ui plan"
```

If there are no changes, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Stage 2 New/Open/Save/Save As are covered by Tasks 2-5.
- Dirty state is already implemented and is preserved by Task 4 tests.
- Dirty replacement confirmation for New/Open is covered in Task 4 and Task 5.
- Window title updates are covered in Task 4.
- Conservative external-change protection before Save is covered in Task 3 and Task 4.
- Native close confirmation and CLI file argument opening remain out of scope for later Stage 2 plans.
- Recent files, drag-and-drop, native menus, shortcuts, and file associations remain out of scope for Stage 3.

Placeholder scan:

- No placeholder markers remain.
- Each changed code file has concrete content or exact patch instructions.
- Each test step includes a command and expected result.

Type consistency:

- `LifecycleDependencies` uses the existing `readTextFile` and `writeTextFile` signatures.
- Dialog wrapper names are `pickOpenFile` and `pickSaveFile` everywhere.
- `ExternalFileChangedError` is used by lifecycle tests and displayed through App error handling.
