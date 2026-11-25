# Roadmap

## Stage 0: Project Definition

Goal: define the product, boundaries, implementation stages, and Galley Editor integration assumptions.

Deliverables:

- vision document
- product principles
- architecture outline
- staged implementation plans
- Galley Editor integration notes

Exit criteria:

- a developer can start scaffolding the app without guessing the product shape
- v1 scope is explicit
- non-goals are documented

## Stage 1: Desktop Skeleton

Goal: create a minimal Tauri + React app that starts quickly and displays a single empty editor surface.

Deliverables:

- Tauri project scaffold
- React app shell
- Galley Editor installed and rendered
- default app layout
- basic theme following system preference

Exit criteria:

- `npm run tauri dev` launches the app
- the user can type into Galley Editor
- the app has no workspace UI, sidebar, or dashboard

## Stage 2: File Lifecycle

Galley Pad opens documents in tabs or separate windows. Saves are atomic and
check for external edits before writing.

Deliverables:

- New
- Open
- Save
- Save As
- dirty-state tracking
- close confirmation
- window title updates
- CLI file argument opening

Exit criteria:

- opening, editing, saving, and closing Markdown files works reliably
- dirty documents cannot be closed accidentally
- saved files remain normal Markdown files on disk

## Stage 3: Desktop Integration

The desktop app provides Open Recent, Markdown file drops, native menus,
and command-line or file-manager opening. The native startup queue keeps
file-open requests until the webview can read them.

Deliverables:

- native menus
- platform shortcuts
- recent files
- drag-and-drop file opening
- file association metadata
- Linux `.desktop` entry
- app icon placeholder or first real icon

Exit criteria:

- a `.md` file can be opened from the desktop environment
- common commands are available from menu and keyboard
- recent documents are easy to reopen without introducing a workspace

## Stage 4: Editing Comfort

Goal: improve daily-use editing ergonomics without expanding product scope.

Deliverables:

- live preview, source, and preview modes in the editor footer
- document table of contents
- find
- font size controls
- readable line width setting
- relative image path handling
- focus restoration
- live external-change detection for the active document and focus checks

Exit criteria:

- the app is comfortable enough to use as the default Markdown opener
- editing behavior issues are routed back to Galley Editor where appropriate

## Stage 5: Packaging And First Daily Driver

Goal: package the app and use it seriously.

Deliverables:

- Linux build
- macOS build if available
- Windows build if available
- basic release notes
- known issues document
- manual smoke-test checklist

Exit criteria:

- Galley Pad can be installed and launched outside the dev environment
- it is safe enough to use on real Markdown files
- rough edges are captured as specific issues, not vague polish debt

## Later, Maybe

These are explicitly outside v1, but may be worth revisiting:

- distraction-free fullscreen
- print
- export to PDF
- optional auto-save
- external-change detection on network mounts without native notifications
- richer settings

These should remain document-focused. If a feature turns Galley Pad into a workspace, it should be rejected or moved to a different product.
