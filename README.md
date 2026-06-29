# Galley Pad

Galley Pad is a simple desktop app for opening, reading, editing, and saving Markdown files.

It is not a notes workspace, not a second brain, and not an IDE. It is a document app: open a Markdown file, work with it comfortably, save it, and close it.

## Installation

Download the installer for your platform from the latest GitHub release.

- Linux: install the `.deb`, `.rpm`, or `.AppImage` artifact.
- Windows: run the `.exe` installer.
- macOS: install the `.dmg` or `.pkg` artifact.

The installed command-line launcher is `gpad`.

### Linux Native Install From A Local Build

Build the release binary:

```bash
npm run tauri -- build --bundles deb,rpm
```

Install the generated package for your distribution from `src-tauri/target/release/bundle/`.

For a user-local install without a distro package, copy the release binary and desktop metadata into the XDG user prefix:

```bash
install -Dm755 src-tauri/target/release/gpad ~/.local/bin/gpad
install -Dm644 src-tauri/icons/icon.png ~/.local/share/icons/hicolor/512x512/apps/gpad.png
```

Create a desktop entry at `~/.local/share/applications/net.inkyquill.GalleyPad.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Galley Pad
Comment=A simple desktop Markdown editor powered by Galley.
Exec=gpad %F
Icon=gpad
Terminal=false
StartupWMClass=gpad
Categories=Utility;TextEditor;
MimeType=text/markdown;text/x-markdown;
Keywords=markdown;editor;text;
```

Then refresh desktop metadata:

```bash
update-desktop-database ~/.local/share/applications
gtk-update-icon-cache -q -t -f ~/.local/share/icons/hicolor
xdg-mime default net.inkyquill.GalleyPad.desktop text/markdown
xdg-mime default net.inkyquill.GalleyPad.desktop text/x-markdown
```

## Documentation

- [Vision](docs/vision.md)
- [Product principles](docs/product-principles.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Stage plans](docs/plans/)
- [Galley Editor integration notes](docs/reference/galley-editor.md)

## Core Promise

Double-click a Markdown file. It opens quickly into a pleasant editable live preview. Save it normally. Close it safely.

## Usage

Open an existing Markdown file:

```bash
gpad notes.md
```

Open multiple files:

```bash
gpad one.md two.markdown
```

Create a new file by opening a path that does not exist yet:

```bash
gpad new-draft.md
```

Relative paths are resolved from the directory where `gpad` is run. Absolute paths stay absolute. The file is created on disk when it is saved.

## Intended Stack

- Tauri for the desktop shell and native file integration
- React for app UI and document state
- Galley Editor for Markdown editing and inline preview
- Rust for filesystem, window lifecycle, dialogs, and platform integration

## Development

Install and activate project toolchains:

```bash
mise install
```

Install dependencies:

```bash
npm install
```

Run frontend unit tests:

```bash
npm run test:unit
```

Run browser integration tests:

```bash
npm run test:integration
```

Run Rust tests:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Build the frontend:

```bash
npm run build
```

Run the desktop app in development:

```bash
npm run tauri:dev
```

Run the full verification suite:

```bash
mise run verify
```

Build the desktop app without packaging:

```bash
node scripts/with-timeout.mjs 120 npm run tauri -- build --debug --no-bundle
```

Build release installers locally:

```bash
npm run tauri -- build
```

On Linux, Tauri produces `.deb`, `.rpm`, and `.AppImage` artifacts when the platform bundling tools are available. On macOS, `npm run macos:pkg -- --release` builds the `.pkg` installer after the `.app` bundle is built.

## Release Automation

Releases are automated with GitHub Actions and semantic-release.

### Versioning

Merging Conventional Commits into `main` runs `.github/workflows/semantic-release.yml`.

semantic-release:

- analyzes commit messages with the Conventional Commits preset
- bumps the version for release-worthy commit types such as `feat`, `fix`, `refactor`, `perf`, `build`, `ci`, `docs`, `test`, `style`, and `chore`
- treats breaking changes as major releases
- creates or updates `CHANGELOG.md`
- writes the release version into `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`
- commits the release metadata back to `main`
- creates a GitHub release tagged as `vX.Y.Z`
- starts the installer build workflow for the new tag

The app footer reads the version from `package.json`, and the Tauri native package metadata reads `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. The generated release version is therefore visible in the app and embedded in the installers.

Run a local release dry run:

```bash
npm run release:dry-run
```

Because the release config publishes GitHub releases, the dry run still needs a valid `GITHUB_TOKEN` or `GH_TOKEN` with access to this repository.

### Installer Builds

After semantic-release publishes a new version, `.github/workflows/semantic-release.yml` dispatches `.github/workflows/build-release.yml` with the new `vX.Y.Z` tag.

The build workflow uploads:

- Linux `.deb`
- Linux `.rpm`
- Linux `.AppImage`
- Windows `.exe`
- macOS `.dmg`
- macOS `.pkg`

The build workflow can also be started manually from GitHub Actions with an existing release tag such as `v1.2.3`.

### Repository Requirements

The release workflows expect:

- GitHub Actions enabled for the repository.
- Workflow permissions that allow `contents: write` and `actions: write`.
- The default `GITHUB_TOKEN` available to workflows.
- The `build-release.yml` workflow present on the default branch, because `workflow_dispatch` runs workflows from the default branch.
- Conventional Commit messages on commits merged into `main`.

Release artifacts are built but not code-signed in this configuration. Signing and notarization can be added later by wiring platform certificates into the build workflow secrets.

### Commit Format

Use Conventional Commits:

```text
feat(editor): add focus mode
fix(files): preserve missing CLI path
refactor(tabs): simplify open document routing
docs(readme): document release flow
```

The pre-commit hook runs verification, and the commit-msg hook checks the Conventional Commit header.
