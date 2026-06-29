# External File Updates Design

## Goal

Galley Pad should notice when an open Markdown file changes outside the app and ask the user how to handle the update. The behavior is session-only and per file. It must protect local edits, avoid silent overwrites, and make conflicts understandable without adding a full merge editor.

## Scope

This feature belongs in the Galley Pad app shell, not in `@inky/galley-editor`. It extends the existing file lifecycle, tab state, save protection, and modal prompt patterns.

In scope:

- Detect changed open file-backed documents when the app regains attention or a tab becomes active.
- Offer per-file session choices for clean external updates.
- Auto-follow future clean external updates for a file when the user chooses that policy.
- Prompt on dirty conflicts regardless of policy.
- Show read-only line-level highlights for clean updates and conflicts.
- Preserve the existing save-time overwrite guard.

Out of scope:

- Persistent external-update preferences.
- Automatic merge or editable diff resolution.
- Native filesystem watchers.
- Galley Editor changes.
- Dedicated deleted-file or unreadable-file recovery flows beyond reporting an error.

## User Decisions

Each file-backed session starts with the external update policy `ask`.

When a clean file changes on disk:

- `Reload` loads the detected disk update once and keeps the policy as `ask`.
- `Follow updates` loads the detected disk update and sets that file session to `follow`.
- `Keep asking` dismisses this detected update without reloading. The app records the detected mtime as already noticed so it does not repeat the same prompt.

When the policy is `follow`, future external changes reload automatically while the editor has no local edits. If local edits exist, the app shows the conflict prompt.

When a dirty file changes on disk:

- `Keep editing` leaves the editor untouched and records this detected mtime as noticed.
- `Reload from disk` discards local edits and loads the current disk content.
- `Save my changes as...` opens Save As and writes the local editor content to the chosen path.

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
- If disk content equals `savedContent`, refresh `lastKnownModifiedAt` without prompting.
- If the detected mtime equals `lastNoticedExternalModifiedAt`, return no prompt.
- If the session is clean, return a clean external update.
- If the session is dirty, return a conflict containing base, local, and external content.

`App.tsx` owns prompt state, runs checks, and applies user choices. The check triggers are:

- browser window `focus`,
- document `visibilitychange` back to visible,
- active tab changes,
- before Save, so the existing overwrite protection remains active.

Checks should run serially to avoid multiple overlapping prompts. If more than one tab changed, the app handles one prompt at a time.

## Data Flow

The app treats `savedContent` as the trusted baseline for diffing and conflict classification:

- `savedContent`: content last loaded from or saved to this path.
- `content`: current editor content.
- `lastKnownModifiedAt`: mtime from the last trusted read or write.

Applying a reload replaces `content` and `savedContent` with external content, updates line ending and mtime, clears dirty state, and clears the noticed external mtime.

Applying `Follow updates` also sets `externalUpdatePolicy` to `follow`.

Applying `Keep asking` or `Keep editing` leaves content untouched and stores the detected mtime as `lastNoticedExternalModifiedAt`.

Applying `Save my changes as...` writes the local content through the existing Save As flow and moves the tab to the selected file path using the existing saved-session behavior.

## UI

Use app-rendered `<dialog>` modals, matching the existing unsaved-changes prompt.

Clean update dialog:

- Title: `File changed outside Galley Pad`
- Body: file name/path and a short explanation.
- Diff: `savedContent` to disk content.
- Actions: `Reload`, `Follow updates`, `Keep asking`.

Dirty conflict dialog:

- Title: `File conflict`
- Body: file name/path and a short explanation that both Galley Pad and another app changed the file.
- Diffs:
  - `Your changes`: `savedContent` to current editor content.
  - `Disk changes`: `savedContent` to current disk content.
- Actions: `Keep editing`, `Reload from disk`, `Save my changes as...`.

The diff view is read-only. Added and removed lines use distinct highlight styles, and unchanged lines are visually quieter. The first implementation can use a line-level longest-common-subsequence diff. It should not present itself as a merge tool.

## Error Handling

Unreadable or deleted files should surface through the existing command error slot for this version. The app should not overwrite a changed file silently. Save should continue to block if the file changed after the session baseline, and the richer conflict flow can be reused to help resolve that situation.

If Save As is cancelled from a conflict, the conflict remains unresolved and local content remains in the editor.

## Testing

Unit tests:

- `src/document/session.test.ts`: default policy and reload state updates.
- `src/document/lifecycle.test.ts`: clean update, dirty conflict, unchanged mtime, same-content mtime refresh, noticed mtime suppression.
- new `src/document/diff.test.ts`: added, removed, changed, and unchanged line output.
- `src/document/workspace.test.ts`: per-tab policy and notice state remain isolated.

App tests:

- clean external change prompts by default.
- `Reload` applies one update and keeps policy as `ask`.
- `Follow updates` applies the update and reloads future clean changes without prompting.
- `Keep asking` dismisses only the detected mtime.
- dirty conflict shows both local and disk diffs.
- `Reload from disk` discards local edits.
- `Save my changes as...` writes local content to the chosen path.

Integration coverage:

- Add browser-level coverage for the modal and highlighted diff if the current Vite integration setup can exercise mocked Tauri APIs cleanly.
- Leave full desktop filesystem mutation coverage for a later Tauri integration test if it requires native shell coordination.

## Acceptance Criteria

- Open file-backed documents are checked for external changes when the app regains focus, visibility returns, or the tab becomes active.
- Clean external updates prompt by default.
- Following updates is per file and lasts only for the current app session.
- Followed files auto-reload only while clean.
- Dirty conflicts always ask before discarding or moving local edits.
- Conflict prompts show line-level highlights for local and disk changes.
- Save cannot silently overwrite a file that changed externally.
- No persistent setting is introduced.
