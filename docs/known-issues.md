# Known Issues

## Stage 1 Desktop Skeleton

- Command: `npm run tauri -- info`
- Expected: Tauri reports app and environment information without hanging.
- Actual: In this sandbox shell, Tauri reports `rustc: not installed` and `Cargo: not installed`, then hangs until interrupted, even though Rustup can run `rustc`, `rustfmt`, and Cargo through explicit toolchain paths.
- Owner: Local development environment.
- Next action: Ensure the active shell exposes the Rust toolchain on `PATH`, or run Tauri commands with the stable toolchain bin directory prepended.
