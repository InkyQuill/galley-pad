# GitHub Release Update Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an editor-footer update link when GitHub has a newer stable Galley Pad release, then open that release in the system browser.

**Architecture:** A pure module fetches and validates the latest GitHub release, compares it to `APP_VERSION`, and returns an update object or `null`. `App` calls it once per mount; `DocumentView` renders a compact button only for an available update; the Tauri opener plugin opens the validated release URL externally.

**Tech Stack:** React 19, TypeScript 6, Vitest, Playwright, semver, Tauri 2, Tauri opener plugin, Rust.

## Global Constraints

- One check per React app mount; no polling, persistence, tokens, background work, download, installation, restart, or preferences.
- Fetch only `https://api.github.com/repos/InkyQuill/galley-pad/releases/latest`.
- Accept only a strictly newer stable semantic version than `APP_VERSION`; tags may start with `v`.
- Silently treat non-OK responses, rejected fetches, invalid JSON, malformed tags, drafts, prereleases, and untrusted URLs as unavailable.
- Open only URLs under `https://github.com/InkyQuill/galley-pad/releases/tag/`.
- Extend CSP only with `https://api.github.com`; scope opener capability to the release-tag URL glob.

---

## File Map

| File | Responsibility |
| --- | --- |
| `src/updates/githubRelease.ts` | Fetch, validate, and compare the latest GitHub release |
| `src/updates/githubRelease.test.ts` | Unit coverage for updates and silent failure paths |
| `src/tauri/opener.ts` | Narrow `openUrl` wrapper |
| `src/App.tsx`, `src/App.test.tsx` | One-shot lookup state and action wiring |
| `src/components/DocumentView.tsx`, `src/components/DocumentView.test.tsx` | Footer indicator and accessibility coverage |
| `src/styles.css` | Compact footer-link styling |
| `tests/integration/app.spec.ts` | Real-editor browser coverage |
| `package.json`, `bun.lock` | Runtime semver and opener binding |
| `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/lib.rs` | Register opener plugin |
| `src-tauri/capabilities/default.json`, `src-tauri/tauri.conf.json` | Narrow permission and GitHub API CSP |

---

### Task 1: Build the release-check boundary

**Files:**

- Create: `src/updates/githubRelease.ts`
- Create: `src/updates/githubRelease.test.ts`
- Modify: `package.json`
- Modify: `bun.lock`

**Interfaces:**

- Produces: `type AvailableUpdate = { version: string; releaseUrl: string }`.
- Produces: `checkForGitHubUpdate(currentVersion: string, fetchImpl?: typeof fetch): Promise<AvailableUpdate | null>`.
- Consumes: runtime `semver`.

- [ ] **Step 1: Move semver to runtime dependencies and write the failing happy-path test**

Move the existing `semver` entry from `devDependencies` to `dependencies`. Create this test:

```ts
import { expect, it, vi } from "vitest";
import { checkForGitHubUpdate } from "./githubRelease";

function response(body: unknown, ok = true): Response {
  return { ok, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

it("returns a newer stable GitHub release", async () => {
  const fetchImpl = vi.fn().mockResolvedValue(
    response({
      draft: false,
      prerelease: false,
      tag_name: "v1.5.1",
      html_url: "https://github.com/InkyQuill/galley-pad/releases/tag/v1.5.1",
    }),
  );

  await expect(checkForGitHubUpdate("1.5.0", fetchImpl)).resolves.toEqual({
    version: "1.5.1",
    releaseUrl: "https://github.com/InkyQuill/galley-pad/releases/tag/v1.5.1",
  });
  expect(fetchImpl).toHaveBeenCalledWith(
    "https://api.github.com/repos/InkyQuill/galley-pad/releases/latest",
    { headers: { Accept: "application/vnd.github+json" } },
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `bun run test:unit -- src/updates/githubRelease.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal checker**

Create the module with:

```ts
export type AvailableUpdate = { version: string; releaseUrl: string };

export async function checkForGitHubUpdate(
  currentVersion: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AvailableUpdate | null> {
  try {
    const result = await fetchImpl(
      "https://api.github.com/repos/InkyQuill/galley-pad/releases/latest",
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!result.ok) return null;
    return parseAvailableUpdate(await result.json(), currentVersion);
  } catch {
    return null;
  }
}
```

Keep `parseAvailableUpdate` private. It must require `draft === false`, `prerelease === false`, a stable cleaned tag, a greater remote version, and an HTTPS URL with origin `https://github.com` and pathname exactly matching the repository release-tag path and original tag. Return `null` for everything else.

- [ ] **Step 4: Add the failure-branch tests**

Use literal fixtures and assert `null` for: equal version `v1.5.0`, older version `v1.4.0`, prerelease `v1.6.0-beta.1`, a draft `v1.6.0`, tag `newest`, and URL `https://example.com/releases/tag/v1.6.0`. Add distinct tests for a non-OK response, rejected fetch, and rejected `json()`.

- [ ] **Step 5: Run GREEN**

Run:

```bash
bun install
bun run test:unit -- src/updates/githubRelease.test.ts
```

Expected: every release-boundary test passes and `bun.lock` is updated.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/updates/githubRelease.ts src/updates/githubRelease.test.ts
git commit -m "feat(updates): check latest GitHub release"
```

### Task 2: Add a narrowly scoped system-browser opener

**Files:**

- Create: `src/tauri/opener.ts`
- Modify: `package.json`, `bun.lock`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/tauri.conf.json`

**Interfaces:**

- Produces: `openReleasePage(url: string): Promise<void>`.
- Later consumer: `App` calls it only with `AvailableUpdate.releaseUrl`.

- [ ] **Step 1: Add the official Tauri plugin**

Run:

```bash
bun run tauri add opener
```

Keep the generated JS guest binding in `dependencies`, the Rust plugin in `[dependencies]`, and both lockfiles. Do not retain the plugin's broad default URL permission.

- [ ] **Step 2: Register and wrap the plugin**

Add `.plugin(tauri_plugin_opener::init())` alongside the existing plugin registrations in `src-tauri/src/lib.rs`.

Create `src/tauri/opener.ts`:

```ts
import { openUrl } from "@tauri-apps/plugin-opener";

export function openReleasePage(url: string): Promise<void> {
  return openUrl(url);
}
```

- [ ] **Step 3: Apply exact security configuration**

Append this capability permission:

```json
{
  "identifier": "opener:allow-open-url",
  "allow": [
    {
      "url": "https://github.com/InkyQuill/galley-pad/releases/tag/*"
    }
  ]
}
```

Change the CSP connect source to `ipc: http://ipc.localhost https://api.github.com`. Do not change any other source directive.

- [ ] **Step 4: Validate the real Tauri configuration**

Build the Tauri desktop application after applying the capability and CSP changes. The Tauri build parses the capability schema and registers the opener plugin, which is the consumer-facing validation for this configuration. Keep the URL trust boundary covered by Task 1's unit tests and the browser-opening behavior covered by Task 3's App test; do not add source-text assertions for JSON configuration.

- [ ] **Step 5: Run focused validation**

Run:

```bash
bun run test:scripts
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
node scripts/with-timeout.mjs 120 bun run tauri -- build --debug --no-bundle
```

Expected: the plugin compiles, the Tauri capability schema accepts the scoped URL permission, and the debug build succeeds. If the existing macOS `native_menu` main-thread failure recurs, record the exact command and output as unrelated verification evidence; do not weaken the new update checks.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/tauri/opener.ts src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json src-tauri/tauri.conf.json
git commit -m "feat(updates): open release pages in browser"
```

### Task 3: Connect the single check and footer indicator

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/DocumentView.tsx`
- Modify: `src/components/DocumentView.test.tsx`
- Modify: `src/styles.css`
- Modify: `tests/integration/app.spec.ts`

**Interfaces:**

- Consumes: `checkForGitHubUpdate(APP_VERSION)` and `openReleasePage(url)`.
- Adds DocumentView props `updateReleaseUrl?: string` and `onOpenUpdate?: () => void`.
- Renders a button labelled `Update available` only when both props are supplied.

- [ ] **Step 1: Write the failing DocumentView test**

Add a test that initially renders `DocumentView` without update props and asserts no `Update available` button. Rerender it with URL `https://github.com/InkyQuill/galley-pad/releases/tag/v1.5.1` and a `vi.fn()` handler; use `userEvent.click` and assert one handler call.

- [ ] **Step 2: Verify RED**

Run: `bun run test:unit -- src/components/DocumentView.test.tsx`

Expected: FAIL because the new props do not exist.

- [ ] **Step 3: Implement the footer control**

Add optional `updateReleaseUrl` and `onOpenUpdate` props. In `footer.after`, before word count, render only when both are truthy:

```tsx
<button
  type="button"
  className="document-footer-update"
  onClick={onOpenUpdate}
>
  Update available
</button>
```

Add CSS beside the other footer styles: transparent background, no border, 12 px font, focus color, hover underline, and a two-pixel `:focus-visible` outline using `--app-focus`.

- [ ] **Step 4: Verify GREEN**

Run: `bun run test:unit -- src/components/DocumentView.test.tsx`

Expected: the new behavior and existing footer tests pass.

- [ ] **Step 5: Write failing App tests**

Mock `./updates/githubRelease` and `./tauri/opener` at the established App-test mock boundary. Add tests that:

1. resolve the checker once with `v1.5.1`, wait for the button, and assert exactly one checker call;
2. resolve `null`, wait for the one call, and assert no button;
3. click the available button and assert `openReleasePage` receives the literal release URL;
4. reject `openReleasePage` and assert no error banner or unhandled rejection.

- [ ] **Step 6: Verify App tests are RED**

Run: `bun run test:unit -- src/App.test.tsx`

Expected: FAIL because App has no update state, effect, or footer wiring.

- [ ] **Step 7: Implement App wiring**

Import `APP_VERSION`, the checker, its `AvailableUpdate` type, and `openReleasePage`. Add `availableUpdate` state. Add one empty-dependency effect with a `disposed` flag; call the checker and set state only when not disposed. Define the click handler so a missing update does nothing and an opener rejection is caught and ignored. Pass the selected release URL and handler to the active `DocumentView`.

- [ ] **Step 8: Run frontend GREEN checks**

Run:

```bash
bun run test:unit -- src/App.test.tsx src/components/DocumentView.test.tsx src/updates/githubRelease.test.ts
bun run build
```

Expected: all focused tests and the production frontend build pass.

- [ ] **Step 9: Add the real-browser regression**

In `tests/integration/app.spec.ts`, route the exact GitHub endpoint before page load. Fulfill it once with stable release `v999.0.0` and the matching GitHub release-tag URL, then assert the real footer button is visible. In a separate test fulfill `v1.5.0` and assert it is absent. Do not mock `@inkyquill/galley-editor`.

Run: `bun run test:integration -- tests/integration/app.spec.ts`

Expected: both Vite/Playwright cases pass.

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/components/DocumentView.tsx src/components/DocumentView.test.tsx src/styles.css tests/integration/app.spec.ts
git commit -m "feat(updates): show available releases in editor footer"
```

### Task 4: Perform release-quality verification

**Files:**

- Modify only files identified by verification as regressions from Tasks 1-3.

- [ ] **Step 1: Run complete verification**

Run: `mise run verify`

Expected: exit 0. If the existing PostCSS advisory or macOS `native_menu` main-thread failure stops the suite, preserve their exact output and run all remaining relevant checks independently. Do not suppress existing checks or weaken the update-check tests.

- [ ] **Step 2: Build the Tauri desktop target**

Run: `node scripts/with-timeout.mjs 120 bun run tauri -- build --debug --no-bundle`

Expected: the opener plugin is registered and the debug app build exits 0.

- [ ] **Step 3: Native smoke check**

Run: `bun run tauri:dev`

With a controlled newer API response, verify that the footer control is compact, keyboard-focusable, and opens the default browser. Restore normal API behavior and verify an up-to-date build has no indicator. Do not add a production override or stored test state.

- [ ] **Step 4: Commit verification-only corrections**

```bash
git add src/updates/githubRelease.ts src/updates/githubRelease.test.ts src/tauri/opener.ts src/App.tsx src/App.test.tsx src/components/DocumentView.tsx src/components/DocumentView.test.tsx src/styles.css tests/integration/app.spec.ts package.json bun.lock src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json src-tauri/tauri.conf.json scripts
git commit -m "test(updates): verify release update checker"
```
