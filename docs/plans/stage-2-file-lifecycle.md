# Stage 2 File Lifecycle Plan

## Goal

Turn the skeleton into a real single-document Markdown file editor.

## Scope

This stage implements normal file lifecycle behavior: New, Open, Save, Save As, dirty state, close confirmation, and opening a file from a command-line argument.

## Proposed Tasks

1. Define the `DocumentSession` TypeScript model.
2. Add typed Tauri command wrappers for file reads and writes.
3. Implement Rust commands for reading and writing text files.
4. Add New command behavior.
5. Add Open command behavior through a native file dialog.
6. Add Save command behavior.
7. Add Save As command behavior through a native file dialog.
8. Track dirty state by comparing current content with saved content.
9. Update the window title with file name and dirty indicator.
10. Confirm before closing a dirty document.
11. Support opening an initial file passed to the app at launch.
12. Add smoke tests or manual verification steps for file lifecycle flows.

## Exit Criteria

- A Markdown file can be opened, edited, saved, and reopened with expected content.
- A new unsaved document can be saved to a chosen path.
- Closing a dirty document offers Save, Discard, and Cancel.
- The app does not silently overwrite external changes.

## Risks

- Encoding and line-ending preservation should be handled deliberately.
- Native close interception differs by platform.
- CLI file handling may require Tauri plugin or platform-specific setup.
