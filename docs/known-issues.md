# Known Issues

## Default App launch produced a blank WebKit window (fixed)

- Reproduced on 2026-10-08 by opening `CHANGELOG.md` from Codex with Open with → Default App.
- The installed process received the correct absolute file path and inherited `GDK_BACKEND=x11` with `WAYLAND_DISPLAY=wayland-0`.
- Its WebKit process logged `Failed to create GBM buffer of size 980x720: Invalid argument` (localized in the journal).
- The DMA-BUF safeguard previously applied only to the effective Wayland backend. Desktop launchers selecting X11 bypassed it.
- Fix: default `WEBKIT_DISABLE_DMABUF_RENDERER=1` for both Linux backends before creating WebKit, while preserving explicit overrides. The compositing workaround remains Wayland-specific.
- React editor failures now retain document state and expose a read-only recovery copy with a retry button. Application import failures retain a visible startup message. These messages cannot diagnose a GPU failure that prevents WebKit itself from painting.
- Verification: Rust policy regression and full verification suite; native debug app opened the Markdown fixture under isolated Xvfb/X11. The installed `/usr/bin/gpad` is unchanged; the exact Codex route on the workstation GPU still needs a retest after installation.

## Release migration verification

- Existing published baseline: `v1.6.2`; the retained local branch still had 1.6.1 metadata. Version sources and release-please's manifest now start at 1.6.2.
- A local rehearsal using release-please 17.11.2's public strategy factory maps `fix(editor): update galley-editor to 0.17.0` to 1.6.3, and `feat` to 1.7.0, preserving historical changelog entries.
- `actionlint` passes; `mise run verify` passes (276 frontend unit tests, 20 script tests, 21 browser integration tests, 40 Rust tests, frontend/Tauri builds). Separate Clippy and Rust documentation checks pass.
- GitHub Actions permission to create release PRs was enabled while retaining the default read-only token policy. Actual bot PR creation, hosted CI and multi-platform installer publication have not been run from this checkout.

## Previous verification blockers (resolved)

The middle-button browser test passes. The remaining `source-map-js` advisory is
resolved by the `^1.2.2` transitive override; `bun audit` passes. Other previously
recorded transitive advisories no longer occur with the current lockfile.

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
