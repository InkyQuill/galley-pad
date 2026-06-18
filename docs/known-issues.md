# Known Issues

## Stage 1 Desktop Skeleton

- Command: `timeout 30 npm run tauri -- info`
- Expected: Tauri reports app and environment information without hanging.
- Actual: The command performs serial network checks against package registries and can exceed short timeouts under load, sometimes before printing diagnostics.
- Owner: Tauri CLI / network environment.
- Next action: Use the 30 second timeout wrapper. If it exits with timeout code 124, continue verification with `timeout 120 npm run tauri -- build --debug --no-bundle`.
