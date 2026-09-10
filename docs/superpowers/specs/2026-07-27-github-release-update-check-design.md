# GitHub Release Update Check

## Goal

Let a Galley Pad user know when a newer stable GitHub release is available, without adding an in-app installer or background polling. When an update exists, the editor footer shows a compact `Update available` link that opens that release in the system browser.

## Scope

- Check once when the application starts.
- Read the public GitHub release for `InkyQuill/galley-pad`.
- Compare the release tag against the bundled application version.
- Render the indicator only when the stable remote version is newer.
- Open the release page in the user's default browser.
- Fail silently for offline, rate-limited, malformed, or otherwise unusable responses.

Out of scope:

- downloading, installing, or restarting the application;
- checking repeatedly during a running session;
- persisting a check result or an ignored version;
- GitHub authentication, prerelease channels, or notification settings.

## Decision

Use GitHub's public `GET /repos/InkyQuill/galley-pad/releases/latest` endpoint. The release workflow creates stable semantic-release releases, so the endpoint is the smallest dependable contract for the desired stable channel. The checker accepts the response only when `tag_name` parses as a semantic version and is greater than `APP_VERSION`.

The request begins once during React app initialization. Its state is in-memory only:

```text
unknown -> checking -> unavailable | available(releaseUrl)
```

`unavailable` covers both an up-to-date application and every failure path. This intentionally avoids treating transient network conditions as user-facing errors.

When state is `available`, `DocumentView` receives a release URL and renders an accessible, non-modal `Update available` button in its footer `after` slot, before the word count and Galley Pad mark. Activating it uses Tauri's opener plugin to open the release's `html_url` in the default browser. The plugin avoids making an external navigation inside the editor WebView.

## Architecture

```text
App mount
  -> checkGitHubRelease(APP_VERSION)
  -> GitHub /releases/latest
  -> semver comparison
  -> available release URL or silent unavailable state
  -> DocumentView footer
  -> opener.openUrl(release html_url)
  -> system browser
```

The checker is a small pure-boundary module rather than App-local fetch logic. It takes a `fetch` implementation in tests, validates untrusted JSON, and returns either the release URL or `null`. App owns the one-shot effect and UI state; `DocumentView` owns only footer rendering and delegates activation through an `onOpenUpdate` callback.

## File Map

| File | Responsibility |
| --- | --- |
| `src/updates/githubRelease.ts` | GitHub endpoint, response validation, semver comparison, and the `string | null` update result |
| `src/updates/githubRelease.test.ts` | Newer/equal/older versions; draft or prerelease-shaped invalid data; fetch failures; malformed tags and URLs |
| `src/tauri/opener.ts` | Small wrapper around Tauri opener for system-browser navigation |
| `src/App.tsx` | Starts exactly one check per mount and passes the available URL to the active editor |
| `src/App.test.tsx` | Verifies one startup check, silent failure, and footer visibility only for a newer release |
| `src/components/DocumentView.tsx` | Renders the footer indicator and delegates activation |
| `src/components/DocumentView.test.tsx` | Verifies accessible indicator placement and callback activation |
| `src/styles.css` | Compact footer-link styling, hover, focus, and dark-theme appearance |
| `src-tauri/Cargo.toml`, `package.json` | Add matching Tauri opener plugin packages |
| `src-tauri/src/lib.rs` | Register the Tauri opener plugin |
| `src-tauri/capabilities/default.json` | Scope opener access to `https://github.com/InkyQuill/galley-pad/releases/tag/*` |
| `src-tauri/tauri.conf.json` | Permit `https://api.github.com` in the CSP `connect-src` directive |

## Validation and Safety

- The checker sends no token and does not store GitHub data.
- Only `https://github.com/InkyQuill/galley-pad/releases/tag/...` release URLs are accepted before being passed to the opener. A malformed or unexpected `html_url` produces no indicator.
- `tag_name` must be a valid stable semantic version (optionally prefixed by `v`). Draft, prerelease, and non-semver data do not advertise an update.
- The local version is taken from the existing `APP_VERSION` build metadata, ensuring the comparison matches the installed application.
- GitHub API errors, non-OK responses, JSON parse failures, fetch rejection, and opener rejection do not crash the editor or show an error banner.

## Acceptance Criteria

1. A launch of version `1.5.0` shows no indicator for release `v1.5.0` and shows `Update available` for `v1.5.1`.
2. The checker runs once per app mount and never schedules periodic work.
3. The footer indicator is absent while checking, up to date, offline, rate-limited, or given malformed release data.
4. The indicator is keyboard reachable, has an explicit accessible name, and opens the validated GitHub release page in the system browser.
5. No GitHub token, persisted update state, auto-download, or install behavior is added.
6. The Tauri CSP permits only the required GitHub API request in addition to existing sources; application security does not regress.
7. Unit and integration coverage prove the comparison contract, silent failure behavior, once-per-launch invocation, visible footer state, and browser-opening action.

## Risks

| Risk | Mitigation |
| --- | --- |
| GitHub rate limit or offline launch | Treat as unavailable and retry only next launch |
| GitHub response fields are untrusted | Validate version and release URL before rendering or opening |
| Future prereleases appear | Use `releases/latest` and reject prerelease tags as a defensive boundary |
| External navigation opens inside the app | Use the Tauri opener plugin rather than a WebView navigation |
| Footer becomes crowded | Use a small text link, rendered only when an update exists |
