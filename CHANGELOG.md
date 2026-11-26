# Changelog

## [1.9.2](https://github.com/InkyQuill/galley-pad/compare/v1.9.1...v1.9.2) (2026-11-26)


### Bug Fixes

* **editor:** align text selection in Galley Pad ([73dbb1d](https://github.com/InkyQuill/galley-pad/commit/73dbb1d7d798d24ecc59ec931d76a82ed78b5a04))
* **editor:** align text selection in Live and Preview ([b46705c](https://github.com/InkyQuill/galley-pad/commit/b46705c42aa5878fedd6268156be5ba4b8b396d5))

## [1.9.1](https://github.com/InkyQuill/galley-pad/compare/v1.9.0...v1.9.1) (2026-11-25)


### Bug Fixes

* **desktop:** address document lifecycle review findings ([e2d499f](https://github.com/InkyQuill/galley-pad/commit/e2d499f3ee8bbb961696a4e3686856630683fee6))
* **desktop:** harden document workflows and compact dialogs ([4ff0944](https://github.com/InkyQuill/galley-pad/commit/4ff09442058def03d3aefb6377f009e7f23849cc))
* **desktop:** harden document workflows and compact dialogs ([b003df0](https://github.com/InkyQuill/galley-pad/commit/b003df02ce4167e3306c7d8517ef115eb6e5c267))
* **editor:** integrate Galley Editor 0.18.1 ([33cde45](https://github.com/InkyQuill/galley-pad/commit/33cde45abe09cfe6b6031768071ff7a6e60ebc0a))
* **editor:** keep the latest heading activation during file open ([459c4d7](https://github.com/InkyQuill/galley-pad/commit/459c4d7b0b9836b30031db6fd8c86e997490f780))

## [1.9.0](https://github.com/InkyQuill/galley-pad/compare/v1.8.0...v1.9.0) (2026-11-25)

### Saving and recovery

- Saves replace files atomically and check the on-disk contents for changes, even when the file timestamp is unchanged. Saving through a symlink preserves the link and the target’s permissions.
- The active document detects external edits while you work. The side-by-side comparison stays aligned across insertions and deletions in large files.
- Each window keeps its own recovery snapshot. Recovered edits are flagged, and quitting checks all open windows for unsaved work.
- Opening the same file again switches to its existing tab or window. Missing paths open as new drafts only when requested from the command line.
- Open UTF-8 files and UTF-16 files with a byte-order mark, or explicitly retry a legacy file as Windows-1251. Saves preserve the original encoding and line endings.

### Reading and navigation

- Jump between headings with the document outline. Switch between Live Preview, Source, and Preview from the footer, and adjust reading width and spellcheck in Settings.
- Follow heading anchors and relative document links. Relative images resolve alongside the document, and remote HTTPS images load only when enabled in Settings.
- Open recent files from the File menu or drop Markdown files onto the app. Drag tabs to reorder them, reopen a closed tab, and keep each tab’s own undo history.
- Settings changes are shared across windows, and native window titles follow the active document.

### Editor and themes

- Updated Galley Editor and Galley Themes to 0.18.0, adding the Edda and Thoth light and dark themes.

## [1.8.0](https://github.com/InkyQuill/galley-pad/compare/v1.7.0...v1.8.0) (2026-11-25)

- Release metadata update. The application source and dependencies are the same as in 1.7.0.

## [1.7.0](https://github.com/InkyQuill/galley-pad/compare/v1.6.3...v1.7.0) (2026-11-25)

- Release metadata update. The application source and dependencies are the same as in 1.6.3.

## [1.6.3](https://github.com/InkyQuill/galley-pad/compare/v1.6.2...v1.6.3) (2026-10-08)


### Bug Fixes

* **pad:** address release and editor recovery review findings ([57e8a70](https://github.com/InkyQuill/galley-pad/commit/57e8a7087a048926d78f706a6f4fa2d5833412a2))
* **pad:** update editor and repair desktop startup ([f3baca3](https://github.com/InkyQuill/galley-pad/commit/f3baca3c72d167865b0798937b785f971b66b08c))
* **pad:** update editor, repair desktop startup and migrate to release-please ([d9aeb34](https://github.com/InkyQuill/galley-pad/commit/d9aeb343bdbd9a6f610994a3e7ba59519aefde84))

## [1.6.2](https://github.com/InkyQuill/galley-pad/compare/v1.6.1...v1.6.2) (2026-09-28)

## [1.6.1](https://github.com/InkyQuill/galley-pad/compare/v1.6.0...v1.6.1) (2026-09-15)

## [1.6.0](https://github.com/InkyQuill/galley-pad/compare/v1.5.1...v1.6.0) (2026-07-27)

## [1.5.1](https://github.com/InkyQuill/galley-pad/compare/v1.5.0...v1.5.1) (2026-07-27)

## [1.5.0](https://github.com/InkyQuill/galley-pad/compare/v1.4.0...v1.5.0) (2026-07-26)

## [1.4.0](https://github.com/InkyQuill/galley-pad/compare/v1.3.0...v1.4.0) (2026-07-24)

## [1.3.0](https://github.com/InkyQuill/galley-pad/compare/v1.2.3...v1.3.0) (2026-07-22)

## [1.2.3](https://github.com/InkyQuill/galley-pad/compare/v1.2.2...v1.2.3) (2026-07-07)

## Unreleased

### Fixed

- Updated Galley Editor to 0.10.2 for corrected table block widths.
- Replaced Galley toolbar and table block controls with Tabler icons.
- Reduced Galley Pad editor content left and right padding.

## [1.2.2](https://github.com/InkyQuill/galley-pad/compare/v1.2.1...v1.2.2) (2026-07-04)

## [1.2.1](https://github.com/InkyQuill/galley-pad/compare/v1.2.0...v1.2.1) (2026-07-04)

## [1.2.0](https://github.com/InkyQuill/galley-pad/compare/v1.1.0...v1.2.0) (2026-07-04)

## [1.1.0](https://github.com/InkyQuill/galley-pad/compare/v1.0.0...v1.1.0) (2026-06-30)

## 1.0.0 (2026-06-30)
