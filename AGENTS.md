# Agent Guide

## Project

Galley Pad is a Tauri desktop Markdown editor. The frontend is React + Vite, and the editor surface is wrapped through `@inkyquill/galley-editor`.

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
bun install --frozen-lockfile
```

For dependency updates during scaffold work, use `bun add` or `bun install` so `package.json` and `bun.lock` stay in sync.

## Common Commands

Run frontend tests:

```bash
bun run test
```

Build the frontend:

```bash
bun run build
```

Check Rust formatting:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

Print Tauri environment and config info:

```bash
node scripts/with-timeout.mjs 30 bun run tauri -- info
```

Build the Tauri debug app without bundling:

```bash
node scripts/with-timeout.mjs 120 bun run tauri -- build --debug --no-bundle
```

Run the desktop app during development:

```bash
bun run tauri:dev
```

Check Bun audit advisories:

```bash
bun audit --json
```

Run the full verification suite through mise:

```bash
mise run verify
```

## Testing Contract

Every new feature needs both unit and integration coverage.

- Unit tests live next to the TypeScript module or inside Rust `#[cfg(test)]` modules.
- Frontend integration tests live in `tests/integration/` and run through Playwright against Vite.
- Rust integration tests live in `src-tauri/tests/`.
- Use `bun run test:unit` for frontend unit tests.
- Use `bun run test:integration` for browser integration tests.
- Use `cargo test --manifest-path src-tauri/Cargo.toml` for Rust tests.
- Use `mise run verify` before committing.

Do not mock `@inkyquill/galley-editor` in Playwright tests. Unit tests may mock it when testing Galley Pad state management or wrappers.

## Commit Convention

Use Conventional Commits for every commit message.

Accepted commit header format:

```text
type(scope): short description
```

Allowed types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`. The scope is optional, and breaking-change `!` is allowed before the colon.
Git-generated merge commit messages such as `Merge branch 'main' into feature` are also accepted.

The repository uses `.githooks/` as `core.hooksPath`. The pre-commit hook runs `bun run verify:fast`, and the commit-msg hook runs `bun run commitlint`.

## Verification Notes

- `bun run tauri -- info` checks Tauri/Rust package metadata over the network and can stall before printing output. Use the Node timeout wrapper above and continue with `tauri-build` if it exits with timeout code 124.
- The app uses TypeScript 6, Vite 8, and Vitest 4. Keep `moduleResolution` set to `Bundler`.
- CSS side-effect imports are declared in `src/vite-env.d.ts`.
- Tauri CSP is enabled in `src-tauri/tauri.conf.json`; do not set `security.csp` back to `null`.
- Vite `envPrefix` must not expose all `TAURI_` variables. Keep it restricted to `TAURI_ENV_`.

## Galley Editor Boundary

Treat `@inkyquill/galley-editor` as an external editor package. Keep Galley Pad-specific integration code in `DocumentView`.

If an implementation concern appears to be inside Galley Editor itself, do not work around it silently in this repo. If `../galley-editor` exists, record the concern in `../galley-editor/known-issues.md` with:

- observed behavior
- expected behavior
- reproduction steps
- Galley Pad impact
- next action

If `../galley-editor` does not exist, record the concern in `docs/known-issues.md` and make clear that it belongs to the Galley Editor package.
