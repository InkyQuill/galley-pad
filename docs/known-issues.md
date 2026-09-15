# Known Issues

## `bun audit` Fails On Pre-Existing Transitive Advisories

- Command: `mise run verify` (first step is `bun audit --json`)
- Expected: the full verification suite runs to completion.
- Actual: `bun audit` exits non-zero on advisories in transitive dependencies (`vitest`/`@vitest/mocker`, `js-yaml`, `nanoid`, `postcss`, `undici`), so `scripts/verify.mjs` aborts before running the later verification steps. Present on the base commit as well; the shared-themes change adds no new advisories.
- Owner: dependency maintenance (transitive versions pinned by `bun.lock`).
- Next action: Upgrade the affected transitive dependencies, then re-run `mise run verify`. Until then, run the remaining verify steps individually (`bun run test:unit`, `bun run test:scripts`, `bun run test:integration`, `bun run build`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --manifest-path src-tauri/Cargo.toml`, Tauri info/build steps).

## Middle-Button Tabstrip Integration Test Fails

- Command: `bun run test:integration tests/integration/app.spec.ts:472`
- Expected: a middle-button press over the tabstrip is not default-prevented and still dispatches (`defaultPrevented: false`, `dispatchResult: true`).
- Actual: the assertion fails with `defaultPrevented: true` and `dispatchResult: false`. The failure reproduces on the base commit as well, so it is not caused by the shared-themes change.
- Owner: Galley Pad tabstrip middle-button event handling.
- Next action: Investigate the tabstrip `onAuxClick`/`onMouseDownCapture` cancellation path and fix the event handling, then re-run the full integration suite.

## Stage 1 Desktop Skeleton

- Command: `node scripts/with-timeout.mjs 30 bun run tauri -- info`
- Expected: Tauri reports app and environment information without hanging.
- Actual: The command performs serial network checks against package registries and can exceed short timeouts under load, sometimes before printing diagnostics.
- Owner: Tauri CLI / network environment.
- Next action: Use the Node timeout wrapper. If it exits with timeout code 124, continue verification with `node scripts/with-timeout.mjs 120 bun run tauri -- build --debug --no-bundle`.

- Command: `bun run tauri:dev`
- Expected: Vite starts on `http://127.0.0.1:1420/` and a native window titled `Galley Pad` opens.
- Actual: Previously, in this local KDE Wayland session, the default run reached `target/debug/galley-pad`, then exited with `Gdk-Message: Error 71 (Protocol error) dispatching to Wayland display`.
- Owner: Galley Pad Linux startup.
- Next action: Fixed by the Linux display startup supervisor. Galley Pad now tries Wayland first with WebKitGTK Wayland safeguards and retries X11 only if the Wayland child process fails during startup.
