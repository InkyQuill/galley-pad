# Known Issues

## Stage 1 Desktop Skeleton

- Command: `node scripts/with-timeout.mjs 30 npm run tauri -- info`
- Expected: Tauri reports app and environment information without hanging.
- Actual: The command performs serial network checks against package registries and can exceed short timeouts under load, sometimes before printing diagnostics.
- Owner: Tauri CLI / network environment.
- Next action: Use the Node timeout wrapper. If it exits with timeout code 124, continue verification with `node scripts/with-timeout.mjs 120 npm run tauri -- build --debug --no-bundle`.

- Command: `npm run tauri:dev`
- Expected: Vite starts on `http://127.0.0.1:1420/` and a native window titled `Galley Pad` opens.
- Actual: Previously, in this local KDE Wayland session, the default run reached `target/debug/galley-pad`, then exited with `Gdk-Message: Error 71 (Protocol error) dispatching to Wayland display`.
- Owner: Galley Pad Linux startup.
- Next action: Fixed by the Linux display startup supervisor. Galley Pad now tries Wayland first with WebKitGTK Wayland safeguards and retries X11 only if the Wayland child process fails during startup.
