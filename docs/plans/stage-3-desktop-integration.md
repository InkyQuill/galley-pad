# Stage 3 Desktop Integration Plan

## Goal

Make Galley Pad behave like a normal desktop app, especially on Linux.

## Scope

This stage adds native menus, shortcuts, recent files, drag-and-drop, and packaging metadata. It does not add workspace features.

## Proposed Tasks

1. Add native menu definitions for document commands.
2. Wire menu actions to the existing React command layer.
3. Add platform-specific keyboard shortcuts.
4. Persist recent files in app configuration.
5. Add a simple recent files surface for the no-document or start state.
6. Support dropping a Markdown file onto the window.
7. Add file association configuration for `.md`, `.markdown`, and `.txt`.
8. Add Linux `.desktop` metadata through Tauri configuration.
9. Add first app icon assets or placeholders.
10. Verify open-from-file-manager behavior on Linux.

## Exit Criteria

- Common commands are available from the app menu.
- Recent files can be reopened without a workspace sidebar.
- Markdown files can be associated with Galley Pad.
- Dragging a file onto the app opens it safely.

## Risks

- File association behavior varies across Linux distributions.
- Recent files can become a workspace-like feature if overdesigned.
- Native menu APIs differ across platforms.
