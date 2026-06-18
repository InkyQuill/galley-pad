# Agent Guide

## Project

Galley Pad is a Tauri desktop Markdown editor. The frontend is React + Vite, and the editor surface is wrapped through `@inky/galley-editor`.

## Important Paths

- `src/` - React application code.
- `src/components/DocumentView.tsx` - stable wrapper around `GalleyEditor`.
- `src/test/setup.ts` - Vitest and Testing Library setup.
- `src-tauri/` - Tauri shell, Rust entrypoints, capabilities, and app config.
- `docs/` - product, architecture, roadmap, plans, references, and known issues.
- `docs/known-issues.md` - known Galley Pad verification or environment issues.

## Setup

This project includes a `mise.toml` for toolchain switching. From the project root:

```bash
mise install
```

Install JavaScript dependencies from the lockfile:

```bash
npm ci
```

For dependency updates during scaffold work, use `npm install` so `package.json` and `package-lock.json` stay in sync.

## Common Commands

Run frontend tests:

```bash
npm test
```

Build the frontend:

```bash
npm run build
```

Check Rust formatting:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

Print Tauri environment and config info:

```bash
node scripts/with-timeout.mjs 30 npm run tauri -- info
```

Build the Tauri debug app without bundling:

```bash
node scripts/with-timeout.mjs 120 npm run tauri -- build --debug --no-bundle
```

Run the desktop app during development:

```bash
npm run tauri:dev
```

Check npm advisories:

```bash
npm audit --json
```

Run the full verification suite through mise:

```bash
mise run verify
```

## Verification Notes

- `npm run tauri -- info` checks Tauri/Rust package metadata over the network and can stall before printing output. Use the Node timeout wrapper above and continue with `tauri-build` if it exits with timeout code 124.
- The app uses TypeScript 6, Vite 8, and Vitest 4. Keep `moduleResolution` set to `Bundler`.
- CSS side-effect imports are declared in `src/vite-env.d.ts`.
- Tauri CSP is enabled in `src-tauri/tauri.conf.json`; do not set `security.csp` back to `null`.
- Vite `envPrefix` must not expose all `TAURI_` variables. Keep it restricted to `TAURI_ENV_`.

## Galley Editor Boundary

Treat `@inky/galley-editor` as an external editor package. Keep Galley Pad-specific integration code in `DocumentView`.

If an implementation concern appears to be inside Galley Editor itself, do not work around it silently in this repo. If `../galley-editor` exists, record the concern in `../galley-editor/known-issues.md` with:

- observed behavior
- expected behavior
- reproduction steps
- Galley Pad impact
- next action

If `../galley-editor` does not exist, record the concern in `docs/known-issues.md` and make clear that it belongs to the Galley Editor package.
