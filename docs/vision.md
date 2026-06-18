# Vision

Galley Pad is a focused Markdown document editor for the desktop.

The app exists for people who like plain files, fast tools, and predictable behavior. It should feel closer to TextEdit, Notepad, or a single-document Kate window than to Obsidian, VS Code, or a knowledge-base workspace.

## Product Statement

Galley Pad opens Markdown files and makes them pleasant to read and edit.

That is the product. Every feature should make one of these actions better:

- open a file
- read a file
- edit a file
- save a file
- close a file safely

If a feature requires a workspace, database, account, plugin marketplace, project tree, sync engine, or knowledge graph, it does not belong in the first version.

## Why This Exists

Markdown is often treated as part of a larger system: a vault, documentation site, IDE project, publishing pipeline, or personal knowledge base. Galley Pad treats a Markdown file as a document.

The user should be able to run:

```bash
galley-pad README.md
```

or double-click a `.md` file and get a clean editor window without being asked to create a workspace, sign in, choose a vault, or learn an application model.

## Relationship To Galley Editor

Galley Editor is the editing engine. Galley Pad is the daily-use desktop host.

This relationship should stay clean:

- Galley Editor owns Markdown editing behavior.
- Galley Pad owns desktop app behavior.
- Bugs found while using Galley Pad should usually improve Galley Editor, not become one-off app hacks.

Galley Pad should pressure-test Galley Editor with real desktop use: large files, malformed Markdown, relative images, file reloads, keyboard shortcuts, focus behavior, theming, and boring save workflows.

## Target Feel

Galley Pad should feel:

- fast to start
- quiet by default
- native enough to trust
- respectful of normal filesystem semantics
- comfortable for both reading and editing
- boring in the best sense

The main interface should be the document. App chrome should support the work without becoming the work.

## Non-Goals

Galley Pad is not:

- a notes database
- an Obsidian clone
- a project workspace
- a code editor
- a publishing platform
- a sync product
- an extensible plugin host
- an AI writing environment

These boundaries are part of the product, not temporary omissions.
