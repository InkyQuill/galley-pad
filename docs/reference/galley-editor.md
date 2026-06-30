# Galley Editor Integration Notes

Galley Pad uses `@inkyquill/galley-editor` as its Markdown editor.

## Package Source

Galley Editor is published to npmjs under the `@inkyquill` scope. Galley Pad does not need a project-level `.npmrc` for this package.

## Install

```bash
npm install @inkyquill/galley-editor
```

## Import

```ts
import { GalleyEditor } from "@inkyquill/galley-editor";
import "@inkyquill/galley-editor/style.css";
```

The stylesheet is optional but recommended. It provides the default Galley theme, CSS variables, toolbar/footer styling, image widgets, tables, code fences, and overlay-style scrollbars.

## Peer Dependencies

Galley expects React and CodeMirror to be available through peer dependencies:

```txt
react >=18
react-dom >=18
@codemirror/state >=6.6.0
@codemirror/view >=6.41.0
@codemirror/commands >=6.10.0
@codemirror/lang-markdown >=6.5.0
@codemirror/language >=6.12.0
@lezer/markdown >=1.6.0
@lezer/highlight >=1.2.0
```

## Integration Rule

Galley Pad should consume Galley Editor as a package. Markdown rendering and editing behavior should be fixed upstream in Galley Editor unless the issue is truly desktop-shell-specific.

## Expected App-Level Needs

The desktop app may need Galley Editor support for:

- controlled content value and change events
- source/live mode control
- theme integration
- focus commands
- find integration or CodeMirror access
- relative image base path or resolver
- editor state preservation across reloads

When these needs appear, prefer adding narrow, reusable Galley Editor APIs instead of app-local DOM workarounds.
