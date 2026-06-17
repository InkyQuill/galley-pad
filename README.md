# Galley Pad

Galley Pad is a simple desktop app for opening, reading, editing, and saving Markdown files.

It is not a notes workspace, not a second brain, and not an IDE. It is a document app: open a Markdown file, work with it comfortably, save it, and close it.

## Documentation

- [Vision](docs/vision.md)
- [Product principles](docs/product-principles.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Stage plans](docs/plans/)
- [Galley Editor integration notes](docs/reference/galley-editor.md)

## Core Promise

Double-click a Markdown file. It opens quickly into a pleasant editable live preview. Save it normally. Close it safely.

## Intended Stack

- Tauri for the desktop shell and native file integration
- React for app UI and document state
- Galley Editor for Markdown editing and inline preview
- Rust for filesystem, window lifecycle, dialogs, and platform integration

## Development

Install dependencies:

```bash
npm install
```

Run frontend tests:

```bash
npm test
```

Build the frontend:

```bash
npm run build
```

Run the desktop app in development:

```bash
npm run tauri:dev
```
