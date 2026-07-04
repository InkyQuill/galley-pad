# External File Updates Design

## Goal

Galley Pad should notice when an open Markdown file changes outside the app and offer clear banner actions for handling the update. The behavior is session-only and per file. It must protect local edits, avoid silent overwrites, and make conflicts understandable without adding a full merge editor.

## Scope

This feature belongs in the Galley Pad app shell, not in `@inky/galley-editor`. It extends the existing file lifecycle, tab state, save protection, warning banner, and reconciliation view patterns.

In scope:

- Detect changed open file-backed documents when the app regains attention or a tab becomes active.
- Offer per-file session choices for clean external updates.
- Auto-follow future clean external updates for a file when the user chooses that policy.
- Warn on dirty conflicts regardless of policy.
- Show read-only side-by-side line highlights when the user chooses to reconcile.
- Preserve the existing save-time overwrite guard.

Out of scope:

- Persistent external-update preferences.
- Editable diff resolution.
- Native filesystem watchers.
- Galley Editor changes.
- Automatic merge.

## User Decisions

Each file-backed session starts with the external update policy `ask`.

When a clean file changes on disk, the app shows an inline banner:

- `Reload` loads the detected disk update once and keeps the policy as `ask`.
- `Follow updates` loads the detected disk update and sets that file session to `follow`.
- `Keep asking` dismisses this detected update without reloading. The app records the detected mtime as already noticed so it does not repeat the same warning.
- `Reconcile` opens a side-by-side comparison view with current content on the left and incoming disk content on the right.

When the policy is `follow`, future external changes reload automatically while the editor has no local edits. If local edits exist, the app shows the conflict banner.

When a dirty file changes on disk, the app shows an inline warning banner:

- `Keep editing` leaves the editor untouched and records this detected mtime as noticed.
- `Reload from disk` discards local edits and loads the current disk content.
- `Save my changes as...` opens Save As and writes the local editor content to the chosen path.
- `Reconcile` opens the side-by-side comparison view.

When an open file was deleted on disk, the app shows an inline warning banner. The editor keeps the last loaded content. The user can keep editing or save the current content with Save As.

## Architecture

External file handling will be implemented through small app-level modules and integrated into `App.tsx`.

`DocumentSession` gains session-only external update fields:

- `externalUpdatePolicy: "ask" | "follow"`
- `lastNoticedExternalModifiedAt: number | null`

The default for new untitled and file-backed sessions is `ask` with no noticed external mtime. These fields are runtime-only. They are not written to app settings, and restored swap tabs should reset them to the defaults so follow/notice choices do not survive an app restart.

Lifecycle helpers in `src/document/lifecycle.ts` or a focused adjacent module compare a session against disk:

- Ignore untitled sessions.
- Read the file from disk.
- If disk `lastModifiedAt` equals `lastKnownModifiedAt`, return no change.
- If disk content equals `savedContent`, refresh `lastKnownModifiedAt` without showing a warning.
- If the detected mtime equals `lastNoticedExternalModifiedAt`, return no warning.
- If the session is clean, return a clean external update.
- If the session is dirty, return a conflict containing base, local, and external content.

`App.tsx` owns warning banner and reconciliation state, runs checks, and applies user choices. The check triggers are:

- browser window `focus`,
- document `visibilitychange` back to visible,
- active tab changes,
- before Save, so the existing overwrite protection remains active.

Checks should run serially to avoid multiple overlapping warnings. If more than one tab changed, the app handles the active tab first.

## Data Flow

The app treats `savedContent` as the trusted baseline for diffing and conflict classification:

- `savedContent`: content last loaded from or saved to this path.
- `content`: current editor content.
- `lastKnownModifiedAt`: mtime from the last trusted read or write.

Applying a reload replaces `content` and `savedContent` with external content, updates line ending and mtime, clears dirty state, and clears the noticed external mtime.

Applying `Follow updates` also sets `externalUpdatePolicy` to `follow`.

Applying `Keep asking` or `Keep editing` leaves content untouched and stores the detected mtime as `lastNoticedExternalModifiedAt`.

Applying `Save my changes as...` writes the local content through the existing Save As flow and moves the tab to the selected file path using the existing saved-session behavior.

Applying `Reconcile` does not mutate document state. It opens a side-by-side read-only comparison surface and leaves the banner decision available.

## UI

External update and deletion notices use app-rendered inline banners, not modals. Banners are for information and warnings; modals are reserved for critical blocking decisions.

Clean update banner:

- Summary: file name/path and a short explanation.
- Actions: `Reload`, `Follow updates`, `Keep asking`, `Reconcile`.
- No diff content appears in the banner.

Dirty conflict banner:

- Summary: file name/path and a short explanation that both Galley Pad and another app changed the file.
- Actions: `Keep editing`, `Reload from disk`, `Save my changes as...`, `Reconcile`.
- No diff content appears in the banner.

Deleted file banner:

- Summary: file name/path and an explanation that the file was deleted on disk.
- Actions: `Keep editing`, `Save As`.

Reconcile view:

- Opens only when the user chooses `Reconcile`.
- Replaces the main editor surface with a side-by-side read-only comparison.
- Left side shows current Galley Pad content.
- Right side shows incoming disk content.
- The panes scroll together.
- Added, removed, and changed lines use distinct highlights.
- It is not an automatic merge or editable diff editor.

## Error Handling

Unreadable files should surface through the existing command error slot for this version. Deleted files should show the deleted-file banner. The app should not overwrite a changed file silently. Save should continue to block if the file changed after the session baseline, and the warning/reconcile flow can be reused to help resolve that situation.

If Save As is cancelled from a conflict, the conflict remains unresolved and local content remains in the editor.

## Testing

Unit tests:

- `src/document/session.test.ts`: default policy and reload state updates.
- `src/document/lifecycle.test.ts`: clean update, dirty conflict, unchanged mtime, same-content mtime refresh, noticed mtime suppression.
- new `src/document/diff.test.ts`: added, removed, changed, and unchanged line output.
- `src/document/workspace.test.ts`: per-tab policy and notice state remain isolated.

App tests:

- clean external changes show a banner by default.
- `Reload` applies one update and keeps policy as `ask`.
- `Follow updates` applies the update and reloads future clean changes without warning while the file is clean.
- `Keep asking` dismisses only the detected mtime.
- dirty conflict shows a banner and opens side-by-side comparison when requested.
- `Reload from disk` discards local edits.
- `Save my changes as...` writes local content to the chosen path.
- deleted file shows a banner.

Integration coverage:

- Add browser-level coverage for the banner and side-by-side reconcile view if the current Vite integration setup can exercise mocked Tauri APIs cleanly.
- Leave full desktop filesystem mutation coverage for a later Tauri integration test if it requires native shell coordination.

## Acceptance Criteria

- Open file-backed documents are checked for external changes when the app regains focus, visibility returns, or the tab becomes active.
- Clean external updates show a banner by default.
- Following updates is per file and lasts only for the current app session.
- Followed files auto-reload only while clean.
- Dirty conflicts always warn before discarding or moving local edits.
- Banners do not contain diffs.
- Reconcile shows side-by-side highlighted local and incoming disk content.
- Save cannot silently overwrite a file that changed externally.
- No persistent setting is introduced.
