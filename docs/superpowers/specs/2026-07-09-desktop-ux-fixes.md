# Desktop UX Fixes

## Goal

Restore reliable access to document commands on Linux, allow tabs to be closed without first activating them, and prevent Linux primary-selection paste inside the editor when the middle mouse button is used.

The reported environment is KDE Plasma on Wayland. The in-app behavior must remain correct on every supported desktop platform; only the menu fallback and primary-selection behavior are Linux-specific.

## Scope

These changes belong to the Galley Pad shell:

- investigate the KDE global-menu failure without assuming a particular GTK integration mechanism;
- provide an always-available Linux in-app menu for Galley Pad's custom File and View commands;
- expose a close button for every tab, with inactive buttons revealed on hover or keyboard focus;
- close tabs with a middle click, including entries in the open-tabs menu;
- cancel middle-button default behavior within `DocumentView` so WebKitGTK cannot paste the primary selection into the editor;
- add unit and Playwright integration coverage for each frontend behavior, plus a native KDE Wayland verification checklist.

No change to `@inkyquill/galley-editor` is expected. If event cancellation at the `DocumentView` boundary does not stop the native paste, record that editor-boundary finding according to `AGENTS.md` before pursuing a lower-level workaround.

Out of scope:

- replacing Tauri's native menu or drawing a complete menu bar in the window chrome;
- making KDE's global-menu widget a release-blocking requirement;
- forcing or installing desktop-session GTK modules from the application process;
- reproducing the native Edit menu in the in-app menu;
- tab reordering, changes to the context menu, or platform-specific middle-click actions outside Linux;
- a raw GTK event filter unless the frontend cancellation is proven insufficient on the affected native environment.

## Findings From Repository Review

### The native-menu diagnosis was too specific

The locked stack is Tauri 2.11.3 with `muda` 0.19.3 and GTK 3. `muda` constructs a `gtk::MenuBar`, inserts it into Tauri's default GTK box, and calls `show()`; it does not use the `GMenuModel`/`GtkApplicationWindow` path described in the original plan. Therefore the claim that Tauri calls `gtk_application_window_set_menubar()` and merely needs `appmenu-gtk-module` is not established.

The application already reaches `.menu(build_native_menu)`, and a failure to construct the menu would fail application startup. The remaining problem may be desktop integration, GTK module behavior, packaging, or KDE configuration. It must be diagnosed on the affected machine.

`GTK_MODULES` is user/session configuration. Galley Pad must not prepend `appmenu-gtk-module` automatically: the module may be absent, its loader name can vary by distribution, and changing it could introduce GTK loader warnings or alter an otherwise working session.

### The original breakpoint could never activate in the desktop window

`src-tauri/tauri.conf.json` sets `minWidth` to 640 px. A `@media (max-width: 520px)` close-button fallback is unreachable in the Tauri app. It also does not correspond to the number of visible tabs. The fallback is removed; hover and `:focus-within` provide the affordance at every supported window size.

### Opacity alone leaves invisible controls interactive

An inactive close button with only `opacity: 0` remains in pointer hit-testing and keyboard navigation. The hidden state must also use `visibility: hidden` and enable visibility for `.tab:hover`, `.tab:focus-within`, and `.tab-active`. This preserves layout without creating an invisible click target. Focusing a tab reveals its close control before normal keyboard traversal reaches it.

### Middle-click cancellation is testable, but primary-selection behavior remains native-only

Vitest and Playwright can verify that cancellable `mousedown` and `auxclick` events are default-prevented within `DocumentView` and remain uncancelled outside it. Browser automation cannot prove WebKitGTK/X11 primary-selection behavior, so the final paste check must also be run in a native Linux build.

## Decisions

### Linux menu fallback

Show the in-app menu button unconditionally on Linux. It supplements the native menu; it does not attempt to detect whether KDE exported or displayed that menu.

Place a small menu button in the Galley Editor footer's `after` slot, before the word count and Galley Pad mark. Use an icon from the existing `react-icons/tb` dependency and an explicit accessible name, `Galley Pad menu`.

The menu contains the six application commands backed by `AppMenuCommand`:

| Group | Label | Command |
|---|---|---|
| File | New | `new` |
| File | Open... | `open` |
| File | Save | `save` |
| File | Save As... | `save-as` |
| View | Toggle Editor Toolbar | `toggle-toolbar` |
| View | Settings... | `settings` |

The frontend labels intentionally mirror the custom items in `build_native_menu`; native Edit actions remain native-only because they are WebView editing actions rather than `AppMenuCommand` values.

Platform gating uses a small pure helper around `navigator.userAgent`. This avoids adding `@tauri-apps/plugin-os` for one display decision and remains unit-testable. Galley Pad is desktop-only, so the fact that Android user agents can contain `Linux` is irrelevant to the supported runtime.

The trigger exposes `aria-haspopup="menu"` and `aria-expanded`. Opening moves focus to the first menu item. Arrow Up/Down, Home, and End move within the menu; Escape closes it and restores trigger focus. Selection and an outside pointer press close it. The menu may use the same visual language as `.tab-menu`, but its state and event listeners remain encapsulated in `FooterMenuButton`.

### Tab close visibility

Render a close button for every tab so closing an inactive document never activates it first.

- Active tab: close button always visible.
- Inactive tab: close button hidden while idle and visible when that individual tab is hovered or contains keyboard focus.
- Hovering the tab strip does not reveal every close button at once.
- The hidden button keeps its 24 px layout allocation to avoid label movement.
- The close button remains explicitly labelled `Close <display name>`.

There is no narrow-window exception. The Tauri window cannot become narrower than 640 px, and mouse hover plus keyboard focus work independently of how many tabs fit in the strip.

### Middle-click tab close

Handle `mousedown` with `button === 1` on the `.tab` wrapper and `.tab-menu-item` wrapper. Call `preventDefault()` and `stopPropagation()`, close the tabs popover when applicable, and invoke `requestCloseTab(tab.id)` exactly once.

This reuses the existing dirty-document and final-tab close paths. A middle click must not select the tab first. Left-click selection and left-click close behavior remain unchanged.

### Middle-click paste suppression

Attach capture-phase `onMouseDownCapture` and `onAuxClickCapture` handlers to the outer `.document-view` element. When `event.button === 1`, call `preventDefault()` and `stopPropagation()`.

Capture phase is deliberate: the stable wrapper sees the event before CodeMirror or another descendant handler. `DocumentView` contains only the editor surface and footer, so the boundary precisely limits the suppression to the editor integration; settings, dialogs, and tab chrome are siblings and remain unaffected.

The implementation does not inspect `contenteditable`. Primary-selection paste may originate from any descendant inside the editor shell, and checking only the immediate target would be brittle against Galley Editor internals.

If this does not suppress paste in WebKitGTK, stop and record the observed behavior, reproduction steps, Galley Pad impact, and proposed next action in `../galley-editor/known-issues.md` when that repository exists, otherwise in `docs/known-issues.md`. A GTK-level filter would affect the whole WebView and cannot meet the requirement that middle-click remain available outside the editor without additional coordinate or DOM bridging, so it requires a separate design.

## Architecture

```text
native Tauri menu event ─┐
                        ├─> App.runMenuCommand(command)
Linux footer menu ──────┘

tab close button ───────┐
tab middle click ───────┼─> App.requestCloseTab(tabId)
tab-menu middle click ──┘

middle-button event inside DocumentView
  -> capture at stable app wrapper
  -> cancel default and propagation
  -> GalleyEditor/CodeMirror does not receive a paste-triggering button event
```

`DocumentView` remains the only integration boundary around `GalleyEditor`. `FooterMenuButton` owns only popover behavior and reports a typed `AppMenuCommand`; it does not know about workspace or file lifecycle state.

## File Map

| File | Responsibility |
|---|---|
| `src/appInfo.ts` | Add pure Linux user-agent detection and exported platform flag |
| `src/appInfo.test.ts` | Cover Linux and non-Linux user agents |
| `src/components/FooterMenuButton.tsx` | New accessible command popover |
| `src/components/FooterMenuButton.test.tsx` | Cover open/close, focus, keyboard navigation, outside press, and command dispatch |
| `src/components/DocumentView.tsx` | Render the Linux menu and cancel middle-button events at the editor boundary |
| `src/components/DocumentView.test.tsx` | Verify platform gating and event cancellation |
| `src/App.tsx` | Wire the footer menu and route tab middle-clicks through `requestCloseTab` |
| `src/App.test.tsx` | Cover close controls on all tabs and clean/dirty middle-click close paths |
| `src/styles.css` | Style the footer menu and interactive close-button visibility |
| `tests/integration/app.spec.ts` | Exercise real Galley Editor DOM, menu commands, hover/focus visibility, and cancellable middle-button events |
| `src-tauri/src/lib.rs` | No default code change; inspect only during affected-machine diagnosis |

## Acceptance Criteria

1. On Linux, the editor footer shows `Galley Pad menu` before the word count and logo. The button is absent on macOS and Windows.
2. The menu dispatches New, Open..., Save, Save As..., Toggle Editor Toolbar, and Settings... through the same `runMenuCommand` path used by native menu events.
3. The menu supports trigger semantics, initial focus, Arrow Up/Down, Home/End, Escape with focus restoration, selection close, and outside-press close.
4. Native menus, their accelerators, and the existing keyboard shortcut handlers are unchanged.
5. Every tab has a close button in the DOM. The active button is visible; an inactive button becomes visible when its tab is hovered or contains focus, and is neither visible nor pointer-interactive while idle.
6. Middle-clicking a tab label or close-button area invokes the close path once without selecting that tab. Dirty tabs show the existing unsaved prompt.
7. Middle-clicking an open-tabs-menu row closes that tab once and closes the popover.
8. Cancellable middle-button `mousedown` and `auxclick` events inside `DocumentView` are default-prevented and do not propagate. Equivalent events in sibling app chrome remain uncancelled.
9. On the affected native Linux environment, middle-clicking CodeMirror content does not paste the primary selection. If it still pastes, the issue is recorded at the required editor boundary and the GTK workaround is not silently added.
10. `bun run test:unit`, `bun run test:integration`, `bun run build`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, and the final `mise run verify` pass.

## Native KDE Wayland Diagnostic Checklist

The global-menu investigation is evidence gathering, not a prerequisite for the in-app fallback:

1. Record Galley Pad/Tauri versions and confirm the native menu appears in-window under an X11 session or another known-good environment.
2. On the affected session, record `XDG_SESSION_TYPE`, `XDG_CURRENT_DESKTOP`, `GDK_BACKEND`, `WAYLAND_DISPLAY`, `DISPLAY`, `GTK_MODULES`, and `UBUNTU_MENUPROXY` without modifying them.
3. Confirm whether other GTK 3 applications using a traditional `GtkMenuBar` appear in the KDE global-menu widget.
4. Check the distribution's installed global-menu/appmenu packages using its package manager; do not assume Debian package names.
5. Compare the affected and working machines, then test any session/module change outside Galley Pad first.
6. Only propose a Tauri, packaging, or documentation change after the failing layer is identified and reproducible.

## Risks

| Risk | Mitigation |
|---|---|
| KDE global-menu integration varies by desktop and distribution | Keep the Linux in-app menu unconditional and treat global-menu export as best-effort |
| Footer popover is clipped by upstream Galley Editor CSS | Verify against the real package in Playwright and native WebKitGTK before release |
| Hidden close controls remain interactive | Pair `opacity` with `visibility` and test computed visibility plus pointer behavior |
| Wrapper cancellation is too late for WebKitGTK primary selection | Use capture-phase handlers and require native verification; document failure before redesign |
| Duplicate menu labels drift from Rust | Keep exactly six typed command entries and assert their labels/commands in component tests |
