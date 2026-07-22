# Desktop UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dependable Linux command menu, close any tab directly by button or middle click, and cancel Linux primary-selection paste at the Galley Pad editor boundary.

**Architecture:** Keep both native and in-app commands routed through `App.runMenuCommand`, and keep every tab-close gesture routed through `App.requestCloseTab`. Encapsulate the accessible Linux menu in a new component, keep platform detection pure, and suppress middle-button events at the stable `DocumentView` wrapper without modifying Galley Editor.

**Tech Stack:** React 19, TypeScript 6, Vitest 4, Testing Library, Playwright, Tauri 2.11, Rust, GTK 3/WebKitGTK on Linux.

## Global Constraints

- Treat `@inkyquill/galley-editor` as external; all editor integration stays in `DocumentView`.
- Every feature receives unit and Playwright integration coverage; Playwright must use the real Galley Editor package.
- Keep the native menu and keyboard shortcuts unchanged.
- Show the in-app command menu only on Linux, but show it unconditionally there.
- Do not mutate `GTK_MODULES` or add a raw GTK event filter in this implementation.
- Keep `moduleResolution` set to `Bundler`, Tauri CSP enabled, and Vite `envPrefix` restricted to `VITE_` and `TAURI_ENV_`.
- Use Conventional Commits for implementation commits.

## Review Corrections Applied

1. Removed the proposed `GMenuModel`/`gtk_application_window_set_menubar()` explanation. The locked `muda` 0.19.3 implementation creates an in-window `gtk::MenuBar` and inserts it into Tauri's GTK box.
2. Removed forced `appmenu-gtk-module` loading. The affected session must be diagnosed before changing application or packaging behavior.
3. Removed the unreachable 520 px breakpoint; the Tauri window has a 640 px minimum width.
4. Replaced opacity-only hiding with opacity plus visibility and `:focus-within` behavior.
5. Added keyboard/focus requirements for the new menu.
6. Added actual unit and Playwright assertions for middle-button cancellation; only the OS primary-selection result remains a manual native check.
7. Changed editor handlers to capture phase and made the GTK escalation a separate design gate rather than pseudocode in this plan.

## File Structure

| File | Change |
|---|---|
| `src/appInfo.ts` | Export a pure Linux user-agent helper and runtime flag |
| `src/appInfo.test.ts` | New helper tests |
| `src/components/FooterMenuButton.tsx` | New accessible Linux command menu |
| `src/components/FooterMenuButton.test.tsx` | New interaction tests |
| `src/components/DocumentView.tsx` | Add optional command callback, Linux menu, and capture-phase middle-button cancellation |
| `src/components/DocumentView.test.tsx` | Add editor-boundary cancellation tests |
| `src/App.tsx` | Wire menu commands and tab middle-click handlers |
| `src/App.test.tsx` | Add all-tab close and middle-click close tests |
| `src/styles.css` | Add footer-menu styles and close-button visibility states |
| `tests/integration/app.spec.ts` | Add real-browser UX coverage |

`src-tauri/src/lib.rs` is deliberately not in the implementation file list. Use the native diagnostic checklist after the frontend fallback is complete; create a separate plan if that evidence identifies a Galley Pad-side native fix.

---

### Task 1: Testable Linux platform detection

**Files:**

- Modify: `src/appInfo.ts`
- Create: `src/appInfo.test.ts`

**Interfaces:**

- Produces: `isLinuxDesktop(userAgent?: string): boolean`
- Produces: `IS_LINUX_DESKTOP: boolean`
- Consumes: browser `navigator.userAgent`; no Tauri plugin or IPC

- [ ] **Step 1: Write the failing helper tests**

Create `src/appInfo.test.ts` with cases that require Linux desktop user agents to return true and Windows/macOS user agents to return false:

```ts
import { describe, expect, it } from "vitest";
import { isLinuxDesktop } from "./appInfo";

describe("isLinuxDesktop", () => {
  it.each([
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    "Mozilla/5.0 (Wayland; Linux x86_64) AppleWebKit/605.1.15",
  ])("recognizes Linux desktop user agents", (userAgent) => {
    expect(isLinuxDesktop(userAgent)).toBe(true);
  });

  it.each([
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  ])("rejects non-Linux desktop user agents", (userAgent) => {
    expect(isLinuxDesktop(userAgent)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing export failure**

Run:

```bash
bun run test:unit -- src/appInfo.test.ts
```

Expected: FAIL because `isLinuxDesktop` is not exported.

- [ ] **Step 3: Add the pure helper and runtime flag**

Append to `src/appInfo.ts`:

```ts
export function isLinuxDesktop(
  userAgent: string = globalThis.navigator?.userAgent ?? "",
): boolean {
  return /(?:X11|Wayland); Linux\b|Linux x86_64\b/.test(userAgent);
}

export const IS_LINUX_DESKTOP = isLinuxDesktop();
```

Keep the existing name, version, and brand exports unchanged.

- [ ] **Step 4: Run the helper tests**

Run:

```bash
bun run test:unit -- src/appInfo.test.ts
```

Expected: PASS with four table-driven cases.

- [ ] **Step 5: Commit the isolated helper**

```bash
git add src/appInfo.ts src/appInfo.test.ts
git commit -m "feat(platform): detect Linux desktop runtime"
```

---

### Task 2: Accessible footer command menu

**Files:**

- Create: `src/components/FooterMenuButton.tsx`
- Create: `src/components/FooterMenuButton.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**

- Consumes: `AppMenuCommand` from `src/tauri/menuEvents.ts`
- Produces: `FooterMenuButton({ onCommand }: { onCommand(command: AppMenuCommand): void })`
- Owns: open state, focus movement, Escape, outside pointer handling, and item metadata

- [ ] **Step 1: Write failing component tests**

Cover these exact observable behaviors in `FooterMenuButton.test.tsx`:

```ts
const labels = [
  "New",
  "Open...",
  "Save",
  "Save As...",
  "Toggle Editor Toolbar",
  "Settings...",
];
```

- the trigger is named `Galley Pad menu`, has `aria-haspopup="menu"`, and starts collapsed;
- clicking it opens `role="menu"` and focuses `New`;
- the six labels appear in the order above;
- ArrowDown/ArrowUp wrap, while Home/End select the first/last item;
- Escape closes the menu and returns focus to the trigger;
- a `pointerdown` outside closes the menu;
- selecting each label emits, respectively, `new`, `open`, `save`, `save-as`, `toggle-toolbar`, or `settings`, then closes the menu.

Use Testing Library's `render`, `screen`, `fireEvent`, and `within`; use `it.each` for the command table.

- [ ] **Step 2: Run the component test and confirm it fails**

Run:

```bash
bun run test:unit -- src/components/FooterMenuButton.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the component**

Use a typed constant as the single frontend source for labels and command values:

```ts
const MENU_ITEMS = [
  { label: "New", command: "new" },
  { label: "Open...", command: "open" },
  { label: "Save", command: "save" },
  { label: "Save As...", command: "save-as" },
  { label: "Toggle Editor Toolbar", command: "toggle-toolbar" },
  { label: "Settings...", command: "settings" },
] as const satisfies ReadonlyArray<{
  label: string;
  command: AppMenuCommand;
}>;
```

Implementation requirements:

- use `TbMenu2` from `react-icons/tb`;
- keep a wrapper ref, trigger ref, and item-button refs;
- attach document `pointerdown` and `keydown` listeners only while open and remove them in the effect cleanup;
- on open, focus item zero in a post-render effect;
- implement ArrowDown, ArrowUp, Home, End, and Escape in the menu key handler;
- render a separator between `Save As...` and `Toggle Editor Toolbar` with `role="separator"`;
- render each command as a `button` with `role="menuitem"`;
- on selection, close before invoking `onCommand`;
- set `aria-expanded={open}` and `aria-controls` on the trigger.

- [ ] **Step 4: Add styles using existing theme tokens**

Add `.footer-menu`, `.footer-menu-trigger`, `.footer-menu-popover`, `.footer-menu-item`, and `.footer-menu-separator` rules to `src/styles.css`. Position the popover above and right-aligned to the trigger. Use only existing `--app-*` and `--ge-*` variables, include `:hover` and `:focus-visible` states, and set a z-index above the editor body but below modal dialogs.

Do not reuse the `.tab-menu` class directly: its `top`/`left`, width, and scroll constraints are specific to the tab strip.

- [ ] **Step 5: Run the menu tests and build**

Run:

```bash
bun run test:unit -- src/components/FooterMenuButton.test.tsx
bun run build
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit the menu component**

```bash
git add src/components/FooterMenuButton.tsx src/components/FooterMenuButton.test.tsx src/styles.css
git commit -m "feat(menu): add accessible footer command menu"
```

---

### Task 3: Integrate the menu and suppress editor middle-button events

**Files:**

- Modify: `src/components/DocumentView.tsx`
- Modify: `src/components/DocumentView.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**

- `DocumentViewProps` gains `onMenuCommand?: (command: AppMenuCommand) => void`
- `DocumentView` consumes `IS_LINUX_DESKTOP` and `FooterMenuButton`
- `App` passes its existing `runMenuCommand` function
- The `.document-view` wrapper cancels middle-button `mousedown` and `auxclick` during capture

- [ ] **Step 1: Write failing `DocumentView` cancellation tests**

Add a helper in `DocumentView.test.tsx` that dispatches a real cancellable event and returns it:

```ts
function dispatchMiddleButton(target: Element, type: "mousedown" | "auxclick") {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 1,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}
```

For both event types, assert that dispatching on `Mock Galley Editor` sets `defaultPrevented` to true. Add a parent bubble listener and assert it is not called. Add a left-button control case and assert it is not prevented.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
bun run test:unit -- src/components/DocumentView.test.tsx
```

Expected: FAIL because the wrapper does not cancel middle-button events.

- [ ] **Step 3: Add the editor-boundary handlers and menu slot**

In `DocumentView.tsx`:

- import `AppMenuCommand`, `IS_LINUX_DESKTOP`, and `FooterMenuButton`;
- add the optional `onMenuCommand` prop;
- add `onMouseDownCapture={suppressMiddleButton}` and `onAuxClickCapture={suppressMiddleButton}` to `<main className="document-view">`;
- render the footer menu before `.document-footer-words` only when `IS_LINUX_DESKTOP && onMenuCommand`.

Use one typed handler outside the component:

```ts
function suppressMiddleButton(
  event: ReactMouseEvent<HTMLElement>,
): void {
  if (event.button !== 1) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
}
```

Import `type MouseEvent as ReactMouseEvent` instead of adding a React namespace dependency if that matches the existing import style.

- [ ] **Step 4: Wire the existing command dispatcher**

In the active `<DocumentView>` render in `src/App.tsx`, add:

```tsx
onMenuCommand={runMenuCommand}
```

Do not create a second command switch. The footer menu and native Tauri menu must enter the same function.

- [ ] **Step 5: Run focused unit tests and the build**

Run:

```bash
bun run test:unit -- src/components/DocumentView.test.tsx src/components/FooterMenuButton.test.tsx
bun run build
```

Expected: all tests pass and TypeScript accepts the new prop and event types.

- [ ] **Step 6: Commit the integration**

```bash
git add src/App.tsx src/components/DocumentView.tsx src/components/DocumentView.test.tsx
git commit -m "fix(editor): suppress middle-click paste events"
```

---

### Task 4: Close controls and middle-click tab behavior

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**

- Every `.tab` owns a close button for its tab ID
- `.tab` and `.tab-menu-item` middle-button handlers call the existing `requestCloseTab(tab.id)`
- No new workspace close function is introduced

- [ ] **Step 1: Write failing close-control tests**

In `src/App.test.tsx`, use `Control+N` to create a second tab, then assert two buttons named `Close Untitled.md` exist even though only one tab is active.

Add a test that focuses or hovers the inactive tab wrapper only at the DOM/class level in Vitest; computed visibility belongs in Playwright.

- [ ] **Step 2: Write failing middle-click behavior tests**

Add tests for:

- middle-clicking an inactive clean `.tab` closes it without changing `aria-selected` first;
- middle-clicking a dirty inactive tab opens the existing unsaved prompt and leaves its editor content intact on Cancel;
- middle-clicking a `.tab-menu-item` closes that tab and closes `role="menu"`;
- a left-button `mousedown` alone does not close a tab;
- one middle-button press produces exactly one close attempt (assert one prompt call for a dirty tab).

Use:

```ts
fireEvent.mouseDown(tab.closest(".tab")!, { button: 1 });
```

For menu rows, find the row through `screen.getByRole("menuitem", { name })` and `.closest(".tab-menu-item")`.

- [ ] **Step 3: Run the focused App tests and confirm failures**

Run:

```bash
bun run test:unit -- src/App.test.tsx
```

Expected: the all-tabs close assertion and middle-click cases fail.

- [ ] **Step 4: Render close buttons unconditionally**

Remove the `tab.id === workspace.activeTabId` conditional around `.tab-close`. Preserve the existing accessible label and left-click handler:

```tsx
<button
  type="button"
  className="tab-close"
  aria-label={`Close ${tab.session.displayName}`}
  onClick={() => void requestCloseTab(tab.id)}
>
  <TbX size={14} strokeWidth={2} aria-hidden="true" />
</button>
```

- [ ] **Step 5: Add one reusable middle-button routing helper**

Inside `App`, add a helper that accepts the React event, tab ID, and whether to close the open-tabs menu:

```ts
function handleTabMouseDown(
  event: ReactMouseEvent<HTMLElement>,
  tabId: string,
  closeMenu = false,
) {
  if (event.button !== 1) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  if (closeMenu) {
    setTabMenuOpen(false);
  }
  void requestCloseTab(tabId);
}
```

Use it from `.tab` and `.tab-menu-item`. Do not attach a second handler to their child close buttons.

Add `type MouseEvent as ReactMouseEvent` to the existing React import.

- [ ] **Step 6: Make hidden close buttons non-interactive**

Extend `.tab-close` with:

```css
opacity: 0;
visibility: hidden;
transition:
  opacity 100ms ease,
  visibility 100ms ease;
```

Then add:

```css
.tab:hover .tab-close,
.tab:focus-within .tab-close,
.tab-active .tab-close {
  opacity: 1;
  visibility: visible;
}
```

Do not add `.tabstrip-tabs:hover .tab-close` and do not add a viewport breakpoint. The button's existing fixed flex basis preserves the label layout.

- [ ] **Step 7: Run App tests and build**

Run:

```bash
bun run test:unit -- src/App.test.tsx
bun run build
```

Expected: PASS; no duplicate close or stale-selection failures.

- [ ] **Step 8: Commit the tab changes**

```bash
git add src/App.tsx src/App.test.tsx src/styles.css
git commit -m "fix(tabs): close inactive tabs directly"
```

---

### Task 5: Real-browser integration coverage

**Files:**

- Modify: `tests/integration/app.spec.ts`

**Interfaces:**

- Tests the production Galley Editor DOM and CSS through Vite/Chromium
- Does not mock `@inkyquill/galley-editor`

- [ ] **Step 1: Add the Linux footer-menu command test**

In Playwright, assert the Linux Chromium project exposes `Galley Pad menu`, open it, choose `New`, and verify the tab count increases from one to two. Reopen it, choose `Toggle Editor Toolbar`, and verify the real `File commands` toolbar becomes visible.

Also assert Escape closes the menu and returns focus to the trigger:

```ts
await page.getByRole("button", { name: "Galley Pad menu" }).click();
await expect(page.getByRole("menu")).toBeVisible();
await page.keyboard.press("Escape");
await expect(page.getByRole("menu")).toBeHidden();
await expect(page.getByRole("button", { name: "Galley Pad menu" })).toBeFocused();
```

- [ ] **Step 2: Add close visibility and middle-click tests**

Create two tabs. Assert the active close button has CSS `visibility: visible`, the inactive one has `visibility: hidden`, and hovering the inactive `.tab` changes only that close button to visible.

Use `locator.click({ button: "middle" })` on the inactive tab label and assert the tab count drops without that tab first becoming selected. Repeat through an open-tabs-menu row.

- [ ] **Step 3: Add real-editor event cancellation tests**

Evaluate cancellable events on `.cm-content`:

```ts
const result = await page.locator(".cm-content").evaluate((target) => {
  const event = new MouseEvent("mousedown", {
    bubbles: true,
    button: 1,
    cancelable: true,
  });
  const dispatchResult = target.dispatchEvent(event);
  return { defaultPrevented: event.defaultPrevented, dispatchResult };
});

expect(result).toEqual({ defaultPrevented: true, dispatchResult: false });
```

Repeat for `auxclick`. Dispatch the same events on `.tabstrip` and assert `defaultPrevented` is false to prove the suppression is scoped to `DocumentView`.

- [ ] **Step 4: Run the integration suite**

Run:

```bash
bun run test:integration
```

Expected: all Playwright tests pass against the real editor package.

- [ ] **Step 5: Commit integration coverage**

```bash
git add tests/integration/app.spec.ts
git commit -m "test(ux): cover desktop menu and middle-click behavior"
```

---

### Task 6: Native KDE Wayland validation and final verification

**Files:**

- Modify only on failure: `../galley-editor/known-issues.md` or `docs/known-issues.md`

**Interfaces:**

- Confirms the browser-level prevention in native WebKitGTK
- Gathers evidence for global-menu integration without changing runtime environment variables

- [ ] **Step 1: Run the complete automated verification**

Run:

```bash
bun run test:unit
bun run test:integration
bun run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
node scripts/with-timeout.mjs 120 bun run tauri -- build --debug --no-bundle
mise run verify
```

Expected: every command exits 0. If `tauri -- info` inside verification times out with 124, follow `docs/known-issues.md` and rely on the successful debug build for that known network-bound check.

- [ ] **Step 2: Verify primary-selection behavior in the native app**

On Linux, select text in another application so the primary selection contains a distinctive value. Middle-click inside CodeMirror and confirm no text appears. Then middle-click a sibling area outside `.document-view` and confirm Galley Pad has not globally swallowed the event.

Repeat under the affected KDE Wayland session. This is the release gate for the paste fix.

- [ ] **Step 3: Record an editor-boundary failure instead of adding a GTK workaround**

Only if native WebKitGTK still pastes, record:

- observed behavior;
- expected behavior;
- exact compositor/session and reproduction steps;
- proof that `mousedown`/`auxclick` were default-prevented in the DOM;
- Galley Pad impact;
- next action: investigate whether Galley Editor/CodeMirror needs a package-level hook before designing native coordinate-aware filtering.

Use `../galley-editor/known-issues.md` if that repository exists; otherwise use `docs/known-issues.md` and label ownership as Galley Editor.

- [ ] **Step 4: Collect KDE global-menu evidence**

On affected and working machines, record without modifying:

```bash
env | rg '^(XDG_SESSION_TYPE|XDG_CURRENT_DESKTOP|GDK_BACKEND|WAYLAND_DISPLAY|DISPLAY|GTK_MODULES|UBUNTU_MENUPROXY)='
```

Confirm whether another GTK 3 application with a traditional `GtkMenuBar` appears in the KDE widget and inspect the distribution's relevant installed packages. Do not use a Debian-specific package command on non-Debian systems.

Outcome choices:

- session/package configuration issue: document the user-facing prerequisite separately;
- reproducible Tauri/`muda` issue: open a focused upstream issue with versions and reproduction;
- Galley Pad packaging issue: write a separate packaging spec and plan;
- inconclusive: retain the unconditional in-app fallback and do not guess at a Rust fix.

- [ ] **Step 5: Review the final diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intended implementation, test, and conditional known-issue files are changed.

## Completion Checklist

- [ ] All six in-app command labels and values match the custom native File/View items.
- [ ] The footer menu is Linux-only and keyboard accessible.
- [ ] Every tab has one close button; hidden inactive controls are not interactive.
- [ ] Middle-click closes clean and dirty tabs through the existing close path exactly once.
- [ ] Editor-boundary middle-button events are canceled in unit and real-browser tests.
- [ ] Native WebKitGTK primary-selection behavior is manually verified or documented as an editor-boundary failure.
- [ ] No `GTK_MODULES` mutation, GTK event filter, unreachable breakpoint, or Galley Editor workaround was added.
- [ ] Full verification passes.
