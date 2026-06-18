# Stage 1 Desktop Skeleton Plan

## Goal

Create the first runnable Tauri + React shell and render Galley Editor inside it.

## Scope

This stage does not implement file open/save. It proves that the app can launch, render a document surface, accept typing, and follow the intended architecture.

## Proposed Tasks

1. Scaffold a Tauri + React + TypeScript project in the repo.
2. Add `.npmrc` for the `@inky` registry.
3. Install `@inky/galley-editor` and required peer dependencies.
4. Import Galley Editor styles.
5. Create the minimal app shell with a single editor surface.
6. Add a quiet default layout with no sidebar, dashboard, or workspace UI.
7. Add basic light/dark theme handling using system preference.
8. Verify startup with the Tauri dev command.

## Initial File Targets

Expected files after scaffold:

- `package.json`
- `.npmrc`
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
