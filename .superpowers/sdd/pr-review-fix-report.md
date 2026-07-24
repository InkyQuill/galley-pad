# PR #14 Review Fix Report

## Changes

- Removed the redundant `latestWordWrap.current = wordWrap` mutation from the
  `App` render path. The ref initializes from the state value, and the two
  state-changing paths (startup restore and toggle) already update it
  synchronously.
- Replaced native-menu detection through `__TAURI_INTERNALS__` with Tauri's
  public `isTauri()` API.
- Updated the native-menu unit test to mock and exercise both `isTauri()`
  outcomes.

## TDD evidence

The updated `nativeMenu.test.ts` was run before the production change. With
`isTauri()` mocked to `true`, it failed as expected because the old direct
global check skipped `invoke` (one failed test, zero `invoke` calls). After
the `isTauri()` implementation change, the focused suite passed.

## Verification

- `bun run test:unit src/tauri/nativeMenu.test.ts src/App.test.tsx` — 2 files,
  79 tests passed.
- `bun run test:unit` — 25 files, 238 tests passed.
- `bun run build` — passed.
- `mise run verify` — passed: empty Bun audit result, 238 frontend unit tests,
  20 script tests, 14 Playwright tests, production build, 40 Rust tests, and
  Tauri environment checks.

## Delivery

- Commit: `fix(menu): use public Tauri runtime detection`.
- Branch: `agent/editor-search-word-wrap`.
- Review replies are required for threads 3644905573 and 3644905578 after
  the commit has been pushed.

## Concerns

- The build reports the existing >500 kB minified chunk warning.
- Node reports its existing experimental localStorage warning during Vitest.
