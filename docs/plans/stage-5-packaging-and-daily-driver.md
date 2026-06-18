# Stage 5 Packaging And Daily Driver Plan

## Goal

Package Galley Pad and use it on real Markdown files.

## Scope

This stage focuses on release readiness, smoke testing, and capturing known issues. It does not require the app to be feature-complete beyond the v1 document-editor promise.

## Proposed Tasks

1. Configure Tauri build metadata.
2. Produce a Linux build.
3. Produce macOS and Windows builds if build hosts are available.
4. Write a manual smoke-test checklist.
5. Test new, open, edit, save, save as, close, and reopen flows.
6. Test files with headings, links, images, code fences, tables, and malformed Markdown.
7. Test large Markdown files.
8. Test dirty-close behavior.
9. Test external file modification behavior.
10. Write release notes.
11. Write a known issues document.
12. Set Galley Pad as the default Markdown opener for daily use.

## Exit Criteria

- The app can be installed and launched outside the development environment.
- It is safe enough to use on real files with backups or version control.
- Known rough edges are captured as concrete follow-up issues.

## Risks

- Tauri packaging details may require platform-specific fixes.
- File associations may work differently across desktop environments.
- Daily use may reveal Galley Editor issues that should block a wider release.
