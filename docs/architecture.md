# Architecture

Galley Pad uses a Tauri shell with a React frontend and Galley Editor as the Markdown editing surface.

```txt
Tauri / Rust
  - file read/write
  - native dialogs
  - recent files
  - window lifecycle
  - platform integration
  - file associations
  - CLI file argument handling

React app
  - document session state
  - command routing
  - dirty-state UI
  - app layout
  - settings UI
  - bridge calls to Tauri

Galley Editor
  - CodeMirror-backed Markdown editing
  - inline preview behavior
  - source/live presentation
  - editor styling and Markdown widgets
```

## Core Data Model

The app should model documents as sessions even while v1 exposes only one document per window. This keeps the implementation honest without requiring tabs.

```ts
type DocumentSession = {
  id: string;
  path: string | null;
  displayName: string;
  content: string;
  savedContent: string;
  dirty: boolean;
  lineEnding: "lf" | "crlf";
  lastKnownModifiedAt: number | null;
};
```

For v1, the app can keep exactly one active session:

```ts
type AppState = {
  document: DocumentSession;
  settings: AppSettings;
};
```

This leaves room for future tabs without introducing tab UI early.

## File Flow

### Open

1. User chooses a file through a native dialog, file association, CLI argument, or drag-and-drop.
2. Rust reads the file as text.
3. Rust returns content, path, modified timestamp, and basic file metadata.
4. React creates a `DocumentSession`.
5. Galley Editor receives the content.
6. Window title updates to the file name.

### Edit

1. Galley Editor emits content changes.
2. React updates `document.content`.
3. React compares content with `document.savedContent`.
4. Dirty state updates.
5. Window title and close behavior reflect dirty state.

### Save

1. User triggers Save.
2. If the document has no path, run Save As.
3. Rust writes the current content to disk.
4. Rust returns updated file metadata.
5. React updates `savedContent`, `dirty`, and `lastKnownModifiedAt`.

### Close

1. If the document is clean, close immediately.
2. If dirty, show a native confirmation dialog.
3. User chooses Save, Discard, or Cancel.
4. The app performs the selected action predictably.

## Rust Commands

The first implementation should expose a small command surface:

```rust
read_text_file(path: String) -> FileReadResult
write_text_file(path: String, content: String) -> FileWriteResult
show_open_dialog() -> Option<String>
show_save_dialog(default_path: Option<String>) -> Option<String>
get_recent_files() -> Vec<RecentFile>
set_recent_file(path: String) -> ()
get_file_metadata(path: String) -> FileMetadata
```

Keep commands boring and explicit. Avoid pushing editor-specific behavior into Rust.

## React Modules

Expected frontend boundaries:

- `App`: top-level shell and command wiring
- `DocumentView`: owns the editor surface for the active document
- `useDocumentSession`: open/save/new/dirty-state logic
- `commands`: keyboard and menu command definitions
- `settings`: app settings model and persistence
- `tauri`: typed wrappers around Tauri commands

## Native Menus And Shortcuts

Galley Pad should provide normal document-editor commands:

- New
- Open
- Save
- Save As
- Close
- Find
- Toggle Source Mode
- Toggle Fullscreen
- Settings

Shortcuts should map naturally by platform. On Linux and Windows, use Control. On macOS, use Command.

## External File Changes

The app should eventually detect when the open file changes on disk.

The initial behavior can be conservative:

1. Check file metadata when the window regains focus.
2. If the timestamp differs and the current document is clean, offer reload.
3. If the timestamp differs and the current document is dirty, warn about conflict and let the user choose.

Do not auto-merge in v1.

## Image Paths

Relative image paths should resolve relative to the Markdown file's directory, not the app working directory. If Galley Editor needs a base path or asset resolver, Galley Pad should provide it through a clear integration prop rather than patching rendered content.
