# Product Principles

## 1. The File Is Sovereign

Markdown on disk is the source of truth.

Galley Pad must not silently convert documents into a private model, normalize formatting unnecessarily, or make round-tripping fragile. Opening and saving a file should preserve the user's text as much as possible.

## 2. Keep the Document in Focus

Open several documents in tabs or choose separate windows. Each tab has its
own editing history and scroll position. The optional table of contents
navigates the active document.

## 3. The App Is Thin

Galley Pad should wrap Galley Editor, not fork it.

Desktop concerns belong in the app:

- native file open/save dialogs
- recent files and file drops
- window title and dirty state
- unsaved changes confirmation
- file association
- command-line file opening
- platform theme detection
- external file modification detection

Markdown editing belongs in Galley Editor:

- inline Markdown rendering
- source/live mode behavior
- image widgets
- code fences
- tables
- cursor and selection behavior
- editor theming

## 4. No Workspace By Accident

Useful features often pull apps toward workspace behavior. Galley Pad should resist that pull.

Avoid in v1:

- folder tree
- backlinks
- graph view
- tags database
- daily notes
- command system built around projects
- global search across folders
- plugin APIs

## 5. Quiet UI, Real Commands

The app should not hide basic document commands. It should provide normal menu items and shortcuts for opening, saving, searching, and closing.

The visible interface should remain minimal, but not mysterious.

## 6. Honest Dirty State

The user must always know whether the document has unsaved changes. Closing a dirty document should be safe and predictable.

Each window keeps its own crash recovery. Quitting goes through unsaved-change
confirmation in every window. When two paths resolve to the same file, the app
focuses the existing editor and protects it from an overlapping Save As. The
active document watches for external changes in its containing directory.

## 7. Banners Warn, Modals Decide

Informational and warning states should appear inline as banners. A file changed on disk, a file was deleted, a background refresh completed, or a recoverable problem needs attention: these are banner cases.

Modal dialogs are reserved for critical decisions that block progress or risk data loss, such as closing a document with unsaved changes. Do not use a modal only to announce an external update.

Diffs do not belong in banners. If an external update needs comparison, show the diff only after the user chooses to reconcile the update.

## 8. Defaults Matter More Than Settings

Settings should exist only where they protect real preferences:

- theme
- font family
- font size
- readable line width
- optional auto-save

The app should not rely on settings to compensate for weak defaults.
