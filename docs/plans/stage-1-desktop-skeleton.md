# Stage 1 Desktop Skeleton Plan

## Goal

Create the first runnable Tauri + React shell and render Galley Editor inside it.

## Scope

This stage does not implement file open/save. It proves that the app can launch, render a document surface, accept typing, and follow the intended architecture.

## Proposed Tasks

1. Scaffold a Tauri + React + TypeScript project in the repo.
2. Install `@inkyquill/galley-editor` from npmjs and required peer dependencies.
3. Import Galley Editor styles.
4. Create the minimal app shell with a single editor surface.
5. Add a quiet default layout with no sidebar, dashboard, or workspace UI.
6. Add basic light/dark theme handling using system preference.
7. Verify startup with the Tauri dev command.

## Initial File Targets

Expected files after scaffold:

- `package.json`
- `src/App.tsx`
- `src/main.tsx`
- `src/styles.css`
- `src-tauri/tauri.conf.json`
- `src-tauri/src/main.rs`

## Exit Criteria

- The app launches through Tauri.
- The editor accepts text input.
- The first screen is the document editor, not a welcome dashboard.
- The app uses Galley Editor from the package registry.

## Risks

- Galley Editor API details may require adaptation once installed.
- Tauri/WebKit behavior may affect editor sizing or focus.
- Peer dependency versions should be pinned deliberately during scaffold.
