# File Lifecycle Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Stage 2 foundation for single-document file lifecycle work by adding a document session model, typed file command wrappers, and Rust read/write text file commands.

**Architecture:** Keep document state in TypeScript as a pure model first, then wire `App` to that model without adding native dialogs yet. Expose a small Rust command surface for reading and writing UTF-8 text files, and call it through typed frontend wrappers so later Open/Save UI work has a stable contract. This plan intentionally stops before native Open/Save dialogs, close confirmation, recent files, menus, or CLI file arguments.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Playwright, Tauri 2, Rust, Cargo, tempfile.

---

## Scope

This is the first Stage 2 slice. It implements:

- `DocumentSession` data model.
- Dirty-state calculation.
- Display-name and line-ending helpers.
- App wiring to use a session instead of raw content.
- Rust `read_text_file` and `write_text_file` commands.
- TypeScript wrappers around those Tauri commands.
- Unit and integration coverage for the new behavior.

This plan does not implement native file dialogs, Save/Save As buttons, close confirmation, window title updates, or CLI file opening. Those should be separate follow-up plans once this command/model foundation is merged.

## File Structure

- Create: `src/document/session.ts` - pure TypeScript document session model and helper functions.
- Create: `src/document/session.test.ts` - unit tests for session creation, dirty tracking, display names, line endings, and save transitions.
- Modify: `src/App.tsx` - use `DocumentSession` instead of raw `content` state.
- Modify: `src/App.test.tsx` - verify initial state and dirty state through the mocked editor.
- Modify: `tests/integration/app.spec.ts` - keep browser coverage of the current app shell and verify the initial session label in the real app.
- Modify: `src-tauri/src/lib.rs` - add filesystem command structs/functions and register Tauri invoke handlers.
- Modify: `src-tauri/tests/scaffold.rs` - add Rust integration coverage for tempfile-backed read/write behavior.
- Create: `src/tauri/files.ts` - typed frontend wrappers around Tauri `invoke`.
- Create: `src/tauri/files.test.ts` - unit tests for wrapper command names and payloads.

---

### Task 1: Document Session Model

**Files:**
- Create: `src/document/session.ts`
- Create: `src/document/session.test.ts`

- [x] **Step 1: Write the failing session model tests**

Create `src/document/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createSessionFromFile,
  createUntitledSession,
  markSessionSaved,
  updateSessionContent,
} from "./session";

describe("document session model", () => {
  it("creates a clean untitled Markdown session", () => {
    const session = createUntitledSession();

    expect(session).toEqual({
      id: "untitled",
      path: null,
      displayName: "Untitled.md",
      content: "# Untitled\n\nStart writing Markdown.\n",
      savedContent: "# Untitled\n\nStart writing Markdown.\n",
      dirty: false,
      lineEnding: "lf",
      lastKnownModifiedAt: null,
    });
  });

  it("creates a clean session from a file result", () => {
    const session = createSessionFromFile({
      path: "/tmp/notes/example.md",
      content: "# Example\r\n\r\nBody\r\n",
      lineEnding: "crlf",
      lastModifiedAt: 1_765_000_000_000,
    });

    expect(session.id).toBe("file:/tmp/notes/example.md");
    expect(session.path).toBe("/tmp/notes/example.md");
    expect(session.displayName).toBe("example.md");
    expect(session.content).toBe("# Example\r\n\r\nBody\r\n");
    expect(session.savedContent).toBe("# Example\r\n\r\nBody\r\n");
    expect(session.dirty).toBe(false);
    expect(session.lineEnding).toBe("crlf");
    expect(session.lastKnownModifiedAt).toBe(1_765_000_000_000);
  });

  it("handles Windows paths when deriving the display name", () => {
    const session = createSessionFromFile({
      path: "C:\\Users\\Inky\\draft.md",
      content: "# Draft\n",
      lineEnding: "lf",
      lastModifiedAt: null,
    });

    expect(session.displayName).toBe("draft.md");
  });

  it("marks a session dirty only when content differs from saved content", () => {
    const session = createUntitledSession();

    const dirty = updateSessionContent(session, "Changed");
    expect(dirty.dirty).toBe(true);
    expect(dirty.content).toBe("Changed");

    const clean = updateSessionContent(dirty, session.savedContent);
    expect(clean.dirty).toBe(false);
    expect(clean.content).toBe(session.savedContent);
  });

  it("marks a session clean after saving", () => {
    const session = updateSessionContent(createUntitledSession(), "Saved text\n");

    const saved = markSessionSaved(session, {
      path: "/tmp/Saved.md",
      lineEnding: "lf",
      lastModifiedAt: 1_765_000_001_000,
    });

    expect(saved.path).toBe("/tmp/Saved.md");
    expect(saved.displayName).toBe("Saved.md");
    expect(saved.savedContent).toBe("Saved text\n");
    expect(saved.dirty).toBe(false);
    expect(saved.lastKnownModifiedAt).toBe(1_765_000_001_000);
  });
});
```

- [x] **Step 2: Run the failing session model tests**

Run:

```bash
npm run test:unit -- src/document/session.test.ts
```

Expected: fail because `src/document/session.ts` does not exist.

- [x] **Step 3: Create `src/document/session.ts`**

```ts
export type LineEnding = "lf" | "crlf";

export type FileReadResult = {
  path: string;
  content: string;
  lineEnding: LineEnding;
  lastModifiedAt: number | null;
};

export type FileWriteResult = {
  path: string;
  lineEnding: LineEnding;
  lastModifiedAt: number | null;
};

export type DocumentSession = {
  id: string;
  path: string | null;
  displayName: string;
  content: string;
  savedContent: string;
  dirty: boolean;
  lineEnding: LineEnding;
  lastKnownModifiedAt: number | null;
};

export const INITIAL_DOCUMENT = `# Untitled

Start writing Markdown.
`;

export function createUntitledSession(): DocumentSession {
  return {
    id: "untitled",
    path: null,
    displayName: "Untitled.md",
    content: INITIAL_DOCUMENT,
    savedContent: INITIAL_DOCUMENT,
    dirty: false,
    lineEnding: "lf",
    lastKnownModifiedAt: null,
  };
}

export function createSessionFromFile(file: FileReadResult): DocumentSession {
  return {
    id: `file:${file.path}`,
    path: file.path,
    displayName: displayNameFromPath(file.path),
    content: file.content,
    savedContent: file.content,
    dirty: false,
    lineEnding: file.lineEnding,
    lastKnownModifiedAt: file.lastModifiedAt,
  };
}

export function updateSessionContent(
  session: DocumentSession,
  content: string,
): DocumentSession {
  return {
    ...session,
    content,
    dirty: content !== session.savedContent,
  };
}

export function markSessionSaved(
  session: DocumentSession,
  result: FileWriteResult,
): DocumentSession {
  return {
    ...session,
    path: result.path,
    displayName: displayNameFromPath(result.path),
    savedContent: session.content,
    dirty: false,
    lineEnding: result.lineEnding,
    lastKnownModifiedAt: result.lastModifiedAt,
  };
}

function displayNameFromPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const name = normalized.split("/").filter(Boolean).at(-1);
  return name && name.trim() ? name : "Untitled.md";
}
```

- [x] **Step 4: Run the session model tests**

Run:

```bash
npm run test:unit -- src/document/session.test.ts
```

Expected: pass with 5 tests.

- [x] **Step 5: Commit**

```bash
git add src/document/session.ts src/document/session.test.ts
git commit -m "feat: add document session model"
```

---

### Task 2: App Session Wiring

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `tests/integration/app.spec.ts`

- [x] **Step 1: Update the App unit tests first**

Replace `src/App.test.tsx` with:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@inky/galley-editor", () => import("./test/galley-editor.mock"));

describe("App", () => {
  it("renders the single-document editor shell with a clean untitled session", () => {
    render(<App />);

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
  });

  it("marks the session dirty when editor content changes", () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "One two three" },
    });

    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    expect(screen.getByLabelText("Document statistics")).toHaveTextContent(
      "3 words",
    );
  });
});
```

- [x] **Step 2: Run the App test and verify it fails**

Run:

```bash
npm run test:unit -- src/App.test.tsx
```

Expected: fail because the app still renders `Draft` after content changes.

- [x] **Step 3: Update `src/App.tsx` to use `DocumentSession`**

Replace `src/App.tsx` with:

```tsx
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
```

- [x] **Step 4: Run App and session unit tests**

Run:

```bash
npm run test:unit -- src/App.test.tsx src/document/session.test.ts
```

Expected: pass.

- [x] **Step 5: Extend the browser integration test for the initial session label**

In `tests/integration/app.spec.ts`, keep the existing shell test and ensure it still contains:

```ts
await expect(page.getByText("Untitled.md")).toBeVisible();
await expect(page.getByText("Draft")).toBeVisible();
```

No additional integration test is required in this task because the existing browser test already covers the user-visible initial session state through the real app.

- [x] **Step 6: Run browser integration tests**

Run:

```bash
npm run test:integration
```

Expected: all Playwright tests pass.

- [x] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx tests/integration/app.spec.ts
git commit -m "feat: wire app to document session"
```

---

### Task 3: Rust Text File Commands

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tests/scaffold.rs`

- [x] **Step 1: Add failing Rust integration tests**

Replace `src-tauri/tests/scaffold.rs` with:

```rust
use std::fs;

#[test]
fn rust_integration_tests_can_use_temp_files() {
    let directory = tempfile::tempdir().expect("create temp dir");
    let path = directory.path().join("document.md");

    fs::write(&path, "# Hello\n").expect("write test markdown");

    let content = fs::read_to_string(&path).expect("read test markdown");
    assert_eq!(content, "# Hello\n");
}
```

Add this test module to `src-tauri/src/lib.rs` inside the existing `#[cfg(test)] mod tests` block:

```rust
    #[test]
    fn read_text_file_returns_content_metadata_and_line_ending() {
        let directory = tempfile::tempdir().expect("create temp dir");
        let path = directory.path().join("draft.md");
        std::fs::write(&path, "# Draft\r\n\r\nBody\r\n").expect("write test markdown");

        let result = super::read_text_file(path.to_string_lossy().into_owned())
            .expect("read text file");

        assert_eq!(result.path, path.to_string_lossy());
        assert_eq!(result.content, "# Draft\r\n\r\nBody\r\n");
        assert_eq!(result.line_ending, super::LineEnding::Crlf);
        assert!(result.last_modified_at.is_some());
    }

    #[test]
    fn write_text_file_writes_content_and_returns_metadata() {
        let directory = tempfile::tempdir().expect("create temp dir");
        let path = directory.path().join("saved.md");

        let result = super::write_text_file(
            path.to_string_lossy().into_owned(),
            "Saved\nText\n".to_string(),
        )
        .expect("write text file");

        assert_eq!(result.path, path.to_string_lossy());
        assert_eq!(result.line_ending, super::LineEnding::Lf);
        assert!(result.last_modified_at.is_some());
        assert_eq!(std::fs::read_to_string(path).expect("read saved file"), "Saved\nText\n");
    }
```

- [x] **Step 2: Run Rust tests and verify they fail**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: fail because `read_text_file`, `write_text_file`, and `LineEnding` are not defined.

- [x] **Step 3: Update `src-tauri/src/lib.rs` with file commands**

Replace `src-tauri/src/lib.rs` with:

```rust
use serde::Serialize;
use std::{
    fs,
    time::{SystemTime, UNIX_EPOCH},
};

fn app_title() -> &'static str {
    "Galley Pad"
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum LineEnding {
    Lf,
    Crlf,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileReadResult {
    path: String,
    content: String,
    line_ending: LineEnding,
    last_modified_at: Option<u64>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileWriteResult {
    path: String,
    line_ending: LineEnding,
    last_modified_at: Option<u64>,
}

#[tauri::command]
fn read_text_file(path: String) -> Result<FileReadResult, String> {
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read text file '{path}': {error}"))?;
    let last_modified_at = last_modified_at_ms(&path)?;

    Ok(FileReadResult {
        path,
        line_ending: detect_line_ending(&content),
        content,
        last_modified_at,
    })
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<FileWriteResult, String> {
    fs::write(&path, &content)
        .map_err(|error| format!("Failed to write text file '{path}': {error}"))?;
    let last_modified_at = last_modified_at_ms(&path)?;

    Ok(FileWriteResult {
        path,
        line_ending: detect_line_ending(&content),
        last_modified_at,
    })
}

fn detect_line_ending(content: &str) -> LineEnding {
    if content.contains("\r\n") {
        LineEnding::Crlf
    } else {
        LineEnding::Lf
    }
}

fn last_modified_at_ms(path: &str) -> Result<Option<u64>, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Failed to read metadata for '{path}': {error}"))?;

    match metadata.modified() {
        Ok(modified) => Ok(system_time_to_ms(modified)),
        Err(_) => Ok(None),
    }
}

fn system_time_to_ms(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

#[cfg(target_os = "linux")]
fn should_disable_dmabuf_renderer(
    wayland_display_present: bool,
    dmabuf_renderer_configured: bool,
) -> bool {
    wayland_display_present && !dmabuf_renderer_configured
}

#[cfg(target_os = "linux")]
fn configure_linux_webkit_wayland_renderer() {
    if should_disable_dmabuf_renderer(
        std::env::var_os("WAYLAND_DISPLAY").is_some(),
        std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some(),
    ) {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    configure_linux_webkit_wayland_renderer();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_text_file, write_text_file])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| panic!("error while running {}: {error}", app_title()));
}

#[cfg(test)]
mod tests {
    use super::app_title;

    #[test]
    fn app_title_matches_product_name() {
        assert_eq!(app_title(), "Galley Pad");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_wayland_disables_dmabuf_renderer_when_unconfigured() {
        assert!(super::should_disable_dmabuf_renderer(true, false));
        assert!(!super::should_disable_dmabuf_renderer(true, true));
        assert!(!super::should_disable_dmabuf_renderer(false, false));
    }

    #[test]
    fn read_text_file_returns_content_metadata_and_line_ending() {
        let directory = tempfile::tempdir().expect("create temp dir");
        let path = directory.path().join("draft.md");
        std::fs::write(&path, "# Draft\r\n\r\nBody\r\n").expect("write test markdown");

        let result = super::read_text_file(path.to_string_lossy().into_owned())
            .expect("read text file");

        assert_eq!(result.path, path.to_string_lossy());
        assert_eq!(result.content, "# Draft\r\n\r\nBody\r\n");
        assert_eq!(result.line_ending, super::LineEnding::Crlf);
        assert!(result.last_modified_at.is_some());
    }

    #[test]
    fn write_text_file_writes_content_and_returns_metadata() {
        let directory = tempfile::tempdir().expect("create temp dir");
        let path = directory.path().join("saved.md");

        let result = super::write_text_file(
            path.to_string_lossy().into_owned(),
            "Saved\nText\n".to_string(),
        )
        .expect("write text file");

        assert_eq!(result.path, path.to_string_lossy());
        assert_eq!(result.line_ending, super::LineEnding::Lf);
        assert!(result.last_modified_at.is_some());
        assert_eq!(
            std::fs::read_to_string(path).expect("read saved file"),
            "Saved\nText\n"
        );
    }
}
```

- [x] **Step 4: Run Rust formatting and tests**

Run:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: both pass.

- [x] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/tests/scaffold.rs
git commit -m "feat: add text file tauri commands"
```

---

### Task 4: Typed Frontend File Command Wrappers

**Files:**
- Create: `src/tauri/files.ts`
- Create: `src/tauri/files.test.ts`

- [x] **Step 1: Write failing wrapper tests**

Create `src/tauri/files.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readTextFile, writeTextFile } from "./files";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: unknown) => invoke(command, args),
}));

describe("file command wrappers", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("invokes read_text_file with a path", async () => {
    invoke.mockResolvedValueOnce({
      path: "/tmp/draft.md",
      content: "# Draft\n",
      lineEnding: "lf",
      lastModifiedAt: 1_765_000_000_000,
    });

    await expect(readTextFile("/tmp/draft.md")).resolves.toEqual({
      path: "/tmp/draft.md",
      content: "# Draft\n",
      lineEnding: "lf",
      lastModifiedAt: 1_765_000_000_000,
    });
    expect(invoke).toHaveBeenCalledWith("read_text_file", {
      path: "/tmp/draft.md",
    });
  });

  it("invokes write_text_file with path and content", async () => {
    invoke.mockResolvedValueOnce({
      path: "/tmp/draft.md",
      lineEnding: "lf",
      lastModifiedAt: 1_765_000_000_000,
    });

    await expect(writeTextFile("/tmp/draft.md", "Saved\n")).resolves.toEqual({
      path: "/tmp/draft.md",
      lineEnding: "lf",
      lastModifiedAt: 1_765_000_000_000,
    });
    expect(invoke).toHaveBeenCalledWith("write_text_file", {
      path: "/tmp/draft.md",
      content: "Saved\n",
    });
  });
});
```

- [x] **Step 2: Run wrapper tests and verify they fail**

Run:

```bash
npm run test:unit -- src/tauri/files.test.ts
```

Expected: fail because `src/tauri/files.ts` does not exist.

- [x] **Step 3: Create `src/tauri/files.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";
import type { FileReadResult, FileWriteResult } from "../document/session";

export function readTextFile(path: string): Promise<FileReadResult> {
  return invoke<FileReadResult>("read_text_file", { path });
}

export function writeTextFile(
  path: string,
  content: string,
): Promise<FileWriteResult> {
  return invoke<FileWriteResult>("write_text_file", { path, content });
}
```

- [x] **Step 4: Run wrapper tests**

Run:

```bash
npm run test:unit -- src/tauri/files.test.ts
```

Expected: pass with 2 tests.

- [x] **Step 5: Commit**

```bash
git add src/tauri/files.ts src/tauri/files.test.ts
git commit -m "feat: add typed file command wrappers"
```

---

### Task 5: Verification And Stage 2 Handoff

**Files:**
- Inspect: `src/document/session.ts`
- Inspect: `src/tauri/files.ts`
- Inspect: `src-tauri/src/lib.rs`
- Inspect: `tests/integration/app.spec.ts`

- [x] **Step 1: Run all frontend unit tests**

Run:

```bash
npm run test:unit
```

Expected: all Vitest unit tests pass, including:

```txt
src/document/session.test.ts
src/tauri/files.test.ts
src/App.test.tsx
src/components/DocumentView.test.tsx
```

- [x] **Step 2: Run browser integration tests**

Run:

```bash
npm run test:integration
```

Expected: all Playwright tests pass and `playwright test` fails if tests are missing.

- [x] **Step 3: Run Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: Rust unit tests include file read/write command coverage and all pass.

- [x] **Step 4: Run full verification**

Run:

```bash
mise run verify
```

Expected:

```txt
npm audit reports 0 vulnerabilities
frontend unit tests pass
browser integration tests pass
frontend build passes
Rust fmt check passes
Rust tests pass
Tauri debug build passes
```

If `tauri info` times out during metadata checks, the existing timeout wrapper should continue to the Tauri debug build.

Observed during implementation: `mise run verify` was attempted twice and stopped at `npm audit --json` because the npm registry audit endpoint returned an error before local checks ran. The remaining verification commands were run directly and passed.

- [x] **Step 5: Confirm this slice stops at the intended boundary**

Run:

```bash
rg -n "show_open_dialog|show_save_dialog|recent|close confirmation|argv|drag" src src-tauri
```

Expected: no new dialog, recent-file, close-confirmation, CLI, or drag-and-drop implementation appears in this slice.

- [x] **Step 6: Commit any verification-only cleanup**

If generated files appear in `git status --short`, do not commit them. They should already be ignored by `.gitignore`.

Run:

```bash
git status --short
```

Expected: clean working tree after the task commits.

---

## Self-Review Notes

- Spec coverage: This plan covers Stage 2 tasks 1-3 from `docs/plans/stage-2-file-lifecycle.md`: session model, typed Tauri wrappers, and Rust read/write commands. It deliberately leaves native New/Open/Save UI, dialogs, close confirmation, window title updates, and CLI file opening for later Stage 2 plans.
- Testing coverage: The plan adds TypeScript unit tests, Rust unit tests, and preserves Playwright integration coverage. It follows the `AGENTS.md` testing contract.
- Boundary check: The plan avoids adding workspace UI, sidebars, tabs, recent files, or desktop integration features.
