# Stage 4 Editing Comfort Plan

## Goal

Make Galley Pad comfortable enough for daily Markdown use while keeping the product focused.

## Scope

This stage improves editor ergonomics and file honesty. It should feed general Markdown editing improvements back into Galley Editor.

## Proposed Tasks

1. Add source/live mode toggle if supported by Galley Editor.
2. Add basic find behavior.
3. Add font size controls.
4. Add readable line width setting.
5. Add settings persistence for theme, font family, font size, and line width.
6. Resolve relative image paths against the document directory.
7. Restore editor focus after open/save dialogs.
8. Check for external file changes when the window regains focus.
9. Warn clearly when the file changed on disk.
10. Create a daily-use issue list for Galley Editor bugs found through the app.

## Exit Criteria

- The app is comfortable as the default opener for normal Markdown files.
- Relative images work for common local paths.
- The user is warned before overwriting a file that changed externally.
- Editor behavior issues have clear ownership: app shell or Galley Editor.

## Risks

- Find may belong in Galley Editor rather than app-level CodeMirror wiring.
- Relative image handling needs a clean Galley Editor API.
- Settings can grow too quickly if not constrained.
