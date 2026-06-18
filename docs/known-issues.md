# Known Issues

## Stage 1 Desktop Skeleton

- Command: `node scripts/with-timeout.mjs 30 npm run tauri -- info`
- Expected: Tauri reports app and environment information without hanging.
- Actual: The command performs serial network checks against package registries and can exceed short timeouts under load, sometimes before printing diagnostics.
- Owner: Tauri CLI / network environment.
- Next action: Use the Node timeout wrapper. If it exits with timeout code 124, continue verification with `node scripts/with-timeout.mjs 120 npm run tauri -- build --debug --no-bundle`.

- Command: `npm run tauri:dev`
- Expected: Vite starts on `http://127.0.0.1:1420/` and a native window titled `Galley Pad` opens.
- Actual: In this local KDE Wayland session, the default run reaches `target/debug/galley-pad`, then exits with `Gdk-Message: Error 71 (Protocol error) dispatching to Wayland display`.
- Owner: Local desktop display environment.
- Next action: Use `GDK_BACKEND=x11 npm run tauri:dev` for local verification; this opened a native `Galley Pad` window in this environment.
