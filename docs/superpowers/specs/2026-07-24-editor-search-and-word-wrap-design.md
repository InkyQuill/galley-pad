# Editor Search and Word Wrap Design

## Summary

Galley Pad will adopt `@inkyquill/galley-editor` 0.11.0 and expose its built-in
search and horizontal-layout controls through the desktop application.

Line wrapping is a global, persisted application preference. It defaults to
enabled and is controlled by a checked `View > Word Wrap` native menu item.
Search remains owned by Galley Editor when the editor has focus, while a native
`Edit > Find...` item opens the same search panel through the editor's
imperative handle.

No changes are required in the adjacent Galley Editor repository. Version
0.11.0 already provides `GalleyEditorProps.horizontalScroll`,
`GalleyHandle.openSearch()`, the CodeMirror search extension, and the built-in
platform `Mod-f` binding.

## Dependency Update

Galley Pad will pin `@inkyquill/galley-editor` to `0.11.0`.

Galley Editor 0.11.0 declares `@codemirror/search >=6.5.0` as a peer
dependency, so Galley Pad will add a compatible direct dependency and update
`bun.lock` through Bun. Existing CodeMirror dependencies remain direct
dependencies because Galley Pad supplies Galley Editor's peers.

## Component Boundary

`DocumentView` remains Galley Pad's only integration boundary with
`GalleyEditor`.

It will accept:

```ts
export type DocumentViewHandle = {
  openSearch(): boolean;
};

export type DocumentViewProps = {
  // Existing props remain unchanged.
  wordWrap?: boolean;
};
```

`DocumentView` will use `forwardRef` and expose a stable `openSearch()` method.
The method delegates to `GalleyHandle.openSearch()` and returns `false` if the
underlying editor has not mounted.

The `wordWrap` prop defaults to `true` and maps to Galley Editor as:

```tsx
<GalleyEditor horizontalScroll={!wordWrap} />
```

This inversion keeps the application-facing preference named after the visible
user behavior while using Galley Editor's editor-wide horizontal-scrolling
policy internally. Galley Editor reconfigures this prop without remounting the
CodeMirror view, so changing the preference preserves document content,
selection, history, focus, plugins, and runtime extensions.

## Application State and Persistence

`App` owns a global `wordWrap` boolean. The value applies to every document tab
in the current window and is passed to the active `DocumentView`.

`PersistedAppSettings` and `RawPersistedAppSettings` will gain:

```ts
wordWrap?: boolean | null;
```

Missing, `null`, or non-boolean persisted values resolve to `true`. This gives
existing installations and malformed settings a safe width-constrained
default.

Startup follows the existing asynchronous settings-loading flow:

1. Render initially with `wordWrap: true`.
2. Read `settings.json`.
3. Normalize `settings.wordWrap` to a boolean.
4. Apply the loaded value to `App` state.
5. Synchronize the native menu check mark with the resolved value.

Changing the preference updates React state immediately and queues
`{ wordWrap }` through the existing `persistAppSettings()` write loop.
`currentAppSettingsSnapshot()` includes the latest word-wrap value so
concurrent preference writes cannot overwrite it.

The setting is shared through the existing application settings file. A newly
opened window reads the saved value. Already-open windows do not receive live
word-wrap updates from another window; cross-window settings broadcasting is
outside the current persistence model and this feature's scope.

## Native Menu Integration

The native Edit menu will add:

```text
Find...    CmdOrCtrl+F
```

Selecting it emits the existing `app-menu-command` event with payload `find`.
`App` handles the command by calling `documentViewRef.current?.openSearch()`.
The ref always points at the active `DocumentView`.

Galley Pad will not add a global JavaScript `Ctrl+F`/`Cmd+F` listener.
Galley Editor 0.11.0 already handles the shortcut when its CodeMirror surface
has focus. Avoiding a second handler prevents the application from stealing
the browser-standard shortcut from settings fields or other focused controls.
The native menu item and the editor key binding open the same CodeMirror search
panel.

The native View menu will add a checked menu item:

```text
[x] Word Wrap
```

Selecting it emits `toggle-word-wrap`. `App` computes the next state from its
current React value, applies it, persists it, and then synchronizes the menu
check mark.

The Rust shell will expose a narrow command that accepts a boolean, resolves
the Word Wrap menu item by its fixed ID, and calls its checked-state setter.
The frontend calls this command after persisted settings load and after every
toggle. Keeping the application value authoritative prevents native menu state
from drifting when startup settings differ from the menu's default.

In a non-Tauri browser/test runtime, the synchronization wrapper resolves
without invoking Rust, following the existing frontend Tauri-wrapper pattern.

## Search Behavior

The CodeMirror search panel is the only search UI. Galley Pad will not build a
parallel React search state or panel.

Search behavior is inherited from Galley Editor 0.11.0:

- `Ctrl+F` on Windows/Linux and `Cmd+F` on macOS opens and focuses the panel.
- Repeated commands reuse the existing panel.
- Escape and the panel close button close it.
- Search remains available in live, Markdown, preview, editable, and read-only
  modes.
- Replacement controls follow Galley Editor and CodeMirror read-only behavior.

The existing exported `findInDocument()` helper is not used because the native
panel already supplies the requested interactive workflow.

## Failure Behavior

- Calling `openSearch()` before the editor mounts returns `false` and does not
  throw or show an error.
- A failed settings write uses the existing `File command error` surface. The
  word-wrap choice remains active for the current session.
- A failed native-menu synchronization is non-fatal: it must not prevent
  settings loading, editor rendering, or line-wrap changes. The wrapper rejects
  so `App` can route the failure through its existing command-error handling.
- An invalid persisted `wordWrap` value is ignored and resolves to `true`.

## Testing

### Frontend unit tests

`DocumentView` tests and the Galley Editor mock will verify:

- wrapping defaults to enabled and passes `horizontalScroll={false}`;
- disabling wrapping passes `horizontalScroll={true}`;
- `DocumentViewHandle.openSearch()` delegates to the Galley handle;
- calling the proxy before the child ref is ready returns `false`.

`App` tests will verify:

- missing, null, and invalid persisted values keep wrapping enabled;
- persisted `false` disables wrapping after startup;
- `toggle-word-wrap` updates the editor immediately;
- toggling queues the complete settings snapshot with the new value;
- startup and toggles synchronize the native check mark;
- `find` calls the active document view's search handle;
- settings-write and menu-sync errors use the existing error surface.

The frontend Tauri wrapper will have focused tests for Tauri and non-Tauri
runtimes.

### Rust tests

Rust tests will verify:

- the Find and Word Wrap menu IDs map to `find` and `toggle-word-wrap`;
- a pure menu-description helper assigns `CmdOrCtrl+F` to Find and initializes
  Word Wrap as checked;
- a pure checked-state lookup helper targets only the fixed Word Wrap item ID.

The Tauri build verifies that these tested descriptions construct valid
`MenuItem` and `CheckMenuItem` instances and that the checked-state command
compiles against the desktop menu API.

### Browser integration

Playwright will use the real `@inkyquill/galley-editor` package and verify:

- `Ctrl+F` opens the CodeMirror search panel;
- changing word wrap changes the real editor between
  `ge-width-constrained` and `ge-horizontal-scroll`.

Playwright will not mock `@inkyquill/galley-editor`.

### Full verification

Before completion, run:

```bash
bun run test:unit
bun run test:integration
cargo test --manifest-path src-tauri/Cargo.toml
mise run verify
```

## Documentation

Update `docs/reference/galley-editor.md` to record the 0.11.0 dependency, the
new `@codemirror/search` peer, the `horizontalScroll` mapping, and the
`openSearch()` integration boundary.

## Out of Scope

- Editing Galley Editor itself.
- A custom search panel or controlled search state.
- A global JavaScript `Ctrl+F`/`Cmd+F` interceptor.
- Per-tab or per-document word-wrap preferences.
- Separate wrapping preferences for code, tables, or prose.
- Live synchronization of word-wrap changes across already-open windows.
- Search-and-replace wrappers beyond the built-in CodeMirror panel.
