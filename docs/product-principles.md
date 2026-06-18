# Product Principles

## 1. The File Is Sovereign

Markdown on disk is the source of truth.

Galley Pad must not silently convert documents into a private model, normalize formatting unnecessarily, or make round-tripping fragile. Opening and saving a file should preserve the user's text as much as possible.

## 2. One Document Is Enough

The first version should use one document per window.

Tabs, sidebars, sessions, and single-instance behavior can be designed for later, but they should not shape the first user experience. The window manager can handle multiple documents.

## 3. The App Is Thin

Galley Pad should wrap Galley Editor, not fork it.

Desktop concerns belong in the app:

- native file open/save dialogs
- recent files
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

The app should handle external changes calmly and explicitly instead of guessing.

## 7. Defaults Matter More Than Settings

Settings should exist only where they protect real preferences:

- theme
- font family
- font size
- readable line width
- optional auto-save

The app should not rely on settings to compensate for weak defaults.
