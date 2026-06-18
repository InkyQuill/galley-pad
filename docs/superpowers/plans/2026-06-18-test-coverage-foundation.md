# Test Coverage Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish unit and integration test coverage as a required baseline before Stage 2 file lifecycle work expands the app.

**Architecture:** Keep unit tests close to the module under test, and add integration tests at the real boundaries: React app behavior in a browser, Rust filesystem behavior through command functions, and the project verification script. The frontend will use Vitest for unit tests and Playwright for browser integration tests; Rust will use `cargo test` for command-level unit and integration-style filesystem tests.

**Tech Stack:** React, Vite, Vitest, Testing Library, Playwright, Tauri 2, Rust, Cargo, mise.

---

## Coverage Policy

Every feature or module added after this plan must have:

- A unit test for local logic, component rendering, or command helper behavior.
- An integration test for the nearest useful boundary:
  - React modules: browser-level Playwright test or full-app Testing Library test.
  - Tauri/Rust commands: Rust tempfile-backed command test.
  - scripts/tooling: Node test or inclusion in `mise run verify`.
- A verification command wired into `mise run verify`.

If a test cannot be automated because it depends on a native desktop shell, record the gap in `docs/known-issues.md` with the manual verification command and the reason automation is deferred.

## File Structure

- Modify: `package.json` - add Playwright scripts and latest test dependency.
- Modify: `package-lock.json` - lock the installed Playwright dependency.
- Create: `playwright.config.ts` - browser integration test configuration.
- Create: `tests/integration/app.spec.ts` - browser integration tests for the current app shell.
- Create: `src/test/galley-editor.mock.tsx` - shared Galley Editor mock used by Vitest tests.
- Modify: `src/App.test.tsx` - use shared mock and keep component unit coverage.
- Modify: `src/components/DocumentView.test.tsx` - use shared mock and keep wrapper unit coverage.
- Modify: `src-tauri/Cargo.toml` - add dev dependency for temporary filesystem tests.
- Modify: `src-tauri/src/lib.rs` - add focused Rust unit tests for app bootstrap-safe helpers.
- Create: `src-tauri/tests/scaffold.rs` - integration test proving the Rust crate is testable.
- Modify: `scripts/verify.mjs` - include Playwright and Cargo tests in verification.
- Modify: `mise.toml` - add explicit `test:unit`, `test:integration`, and `test:rust` tasks.
- Modify: `AGENTS.md` - document the testing policy and commands.
- Modify: `README.md` - document the test commands for humans.

---

### Task 1: Add Browser Integration Test Tooling

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `playwright.config.ts`

- [x] **Step 1: Install latest Playwright test tooling**

Run:

```bash
npm install -D @playwright/test@latest
```

Expected:

```txt
added ... packages
found 0 vulnerabilities
```

- [x] **Step 2: Install Playwright Chromium browser**

Run:

```bash
npx playwright install chromium
```

Expected:

```txt
Downloading Chromium ...
```

If Chromium is already installed, Playwright may exit without downloading.

- [x] **Step 3: Update `package.json` scripts**

Replace the `scripts` block with:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:unit": "vitest run",
  "test:integration": "playwright test --pass-with-no-tests",
  "tauri": "tauri",
  "tauri:dev": "tauri dev",
  "tauri:build": "tauri build"
}
```

- [x] **Step 4: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/integration",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:1420",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

- [x] **Step 5: Commit**

```bash
git add package.json package-lock.json playwright.config.ts
git commit -m "test: add browser integration tooling"
```

---

### Task 2: Consolidate Frontend Unit Test Mocks

**Files:**
- Create: `src/test/galley-editor.mock.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/DocumentView.test.tsx`

- [x] **Step 1: Create `src/test/galley-editor.mock.tsx`**

```tsx
export function GalleyEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (content: string) => void;
}) {
  return (
    <textarea
      aria-label="Mock Galley Editor"
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}
```

- [x] **Step 2: Update `src/App.test.tsx` to use the shared mock**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@inky/galley-editor", () => import("./test/galley-editor.mock"));

describe("App", () => {
  it("renders the single-document editor shell with starter Markdown", () => {
    render(<App />);

    expect(screen.getByText("Untitled.md")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(
      screen.getByRole("main", { name: "Markdown document editor" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "# Untitled\n\nStart writing Markdown.\n",
    );
    expect(screen.getByLabelText("Document statistics")).toHaveTextContent(
      "4 words",
    );
  });

  it("updates document statistics when editor content changes", () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "One two three" },
    });

    expect(screen.getByLabelText("Document statistics")).toHaveTextContent(
      "3 words",
    );
  });
});
```

- [x] **Step 3: Update `src/components/DocumentView.test.tsx` to use the shared mock**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentView } from "./DocumentView";

vi.mock("@inky/galley-editor", () => import("../test/galley-editor.mock"));

describe("DocumentView", () => {
  it("renders the markdown editor region", () => {
    render(<DocumentView content="# Hello" onContentChange={() => undefined} />);

    expect(
      screen.getByRole("main", { name: "Markdown document editor" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue("# Hello");
  });

  it("passes edited content through the stable app callback", () => {
    const onContentChange = vi.fn();
    render(<DocumentView content="Initial" onContentChange={onContentChange} />);

    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "Changed" },
    });

    expect(onContentChange).toHaveBeenCalledTimes(1);
    expect(onContentChange).toHaveBeenCalledWith("Changed");
  });
});
```

- [x] **Step 4: Run frontend unit tests**

Run:

```bash
npm run test:unit
```

Expected:

```txt
Test Files  2 passed
Tests  4 passed
```

- [x] **Step 5: Commit**

```bash
git add src/test/galley-editor.mock.tsx src/App.test.tsx src/components/DocumentView.test.tsx
git commit -m "test: share frontend editor mock"
```

---

### Task 3: Add Current App Browser Integration Tests

**Files:**
- Create: `tests/integration/app.spec.ts`

- [x] **Step 1: Create `tests/integration/app.spec.ts`**

```ts
import { expect, test } from "@playwright/test";

test("renders the document editor shell in a real browser", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Untitled.md")).toBeVisible();
  await expect(page.getByText("Draft")).toBeVisible();
  await expect(
    page.getByRole("main", { name: "Markdown document editor" }),
  ).toBeVisible();
  await expect(page.getByLabel("Document statistics")).toHaveText("4 words");
});

test("loads the Galley Editor integration without a unit-test mock", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("main", { name: "Markdown document editor" }),
  ).toBeVisible();
  await expect(page.locator(".document-view")).toBeVisible();
  await expect(page.locator(".document-view")).toContainText("Untitled");
});
```

- [x] **Step 2: Run browser integration tests**

Run:

```bash
npm run test:integration
```

Expected:

```txt
2 passed
```

If the second test fails because Galley Editor renders the starter Markdown through non-text editor internals, replace only the final assertion with the nearest stable visible signal from the real rendered editor. Do not mock `@inky/galley-editor` in Playwright tests.

- [x] **Step 3: Commit**

```bash
git add tests/integration/app.spec.ts
git commit -m "test: cover app shell in browser"
```

---

### Task 4: Add Rust Test Baseline

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/tests/scaffold.rs`

- [x] **Step 1: Add Rust dev dependency**

In `src-tauri/Cargo.toml`, add:

```toml
[dev-dependencies]
tempfile = "3"
```

- [x] **Step 2: Add a unit-testable helper and unit test in `src-tauri/src/lib.rs`**

Replace `src-tauri/src/lib.rs` with:

```rust
fn app_title() -> &'static str {
    "Galley Pad"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| panic!("error while running {}: {error}", app_title()));
}

#[cfg(test)]
mod tests {
    use super::app_title;

    #[test]
    fn app_title_matches_product_name() {
        assert_eq!(app_title(), "Galley Pad");
    }
}
```

- [x] **Step 3: Create `src-tauri/tests/scaffold.rs`**

```rust
use std::fs;

#[test]
fn rust_integration_tests_can_use_temp_files() {
    let directory = tempfile::tempdir().expect("create temp dir");
    let path = directory.path().join("document.md");

    fs::write(&path, "# Hello\n").expect("write test markdown");

    let content = fs::read_to_string(&path).expect("read test markdown");
    assert_eq!(content, "# Hello\n");
}
```

- [x] **Step 4: Run Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected:

```txt
test result: ok
```

- [x] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/tests/scaffold.rs
git commit -m "test: add rust test baseline"
```

---

### Task 5: Wire All Test Layers Into Verification

**Files:**
- Modify: `scripts/verify.mjs`
- Modify: `mise.toml`
- Modify: `vite.config.ts`

- [x] **Step 1: Update `scripts/verify.mjs`**

Replace the file with:

```js
import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: options.shell ?? process.platform === "win32",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.signal) {
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("npm", ["audit", "--json"]);
run("npm", ["run", "test:unit"]);
run("npm", ["run", "test:integration"]);
run("npm", ["run", "build"]);
run("cargo", ["fmt", "--manifest-path", "src-tauri/Cargo.toml", "--", "--check"]);
run("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml"]);
run(process.execPath, ["scripts/tauri-info.mjs"], { shell: false });
run(
  process.execPath,
  [
    "scripts/with-timeout.mjs",
    "120",
    "npm",
    "run",
    "tauri",
    "--",
    "build",
    "--debug",
    "--no-bundle",
  ],
  { shell: false },
);
```

- [x] **Step 2: Update `mise.toml` test tasks**

Replace the task section from `[tasks.test]` through `[tasks.verify]` with:

```toml
[tasks.test]
description = "Run all automated tests"
depends = ["test-unit", "test-integration", "test-rust"]

[tasks.test-unit]
description = "Run frontend unit tests"
run = "npm run test:unit"

[tasks.test-integration]
description = "Run browser integration tests"
run = "npm run test:integration"

[tasks.test-rust]
description = "Run Rust unit and integration tests"
run = "cargo test --manifest-path src-tauri/Cargo.toml"

[tasks.build]
description = "Build the frontend"
run = "npm run build"

[tasks.fmt-rust]
description = "Check Rust formatting"
run = "cargo fmt --manifest-path src-tauri/Cargo.toml -- --check"

[tasks.tauri-info]
description = "Print Tauri environment and app configuration"
run = "node scripts/tauri-info.mjs"

[tasks.tauri-build]
description = "Build the Tauri debug app without bundling"
run = "node scripts/with-timeout.mjs 120 npm run tauri -- build --debug --no-bundle"

[tasks.audit]
description = "Check npm security advisories"
run = "npm audit --json"

[tasks.verify]
description = "Run the full verification suite"
run = "node scripts/verify.mjs"
```

- [x] **Step 3: Keep Vitest scoped to unit tests**

In the existing `test` config in `vite.config.ts`, keep `environment`, `setupFiles`, and `globals`, and add:

```ts
include: ["src/**/*.test.{ts,tsx}"],
```

This keeps Playwright as the exclusive owner of `tests/integration`.

- [x] **Step 4: Run all verification**

Run:

```bash
mise run verify
```

Expected:

```txt
0 vulnerabilities
Test Files  2 passed
2 passed
test result: ok
```

The Tauri info and build steps should also complete or fail with a specific actionable error.

- [x] **Step 5: Commit**

```bash
git add scripts/verify.mjs mise.toml vite.config.ts docs/superpowers/plans/2026-06-18-test-coverage-foundation.md
git commit -m "test: run all coverage layers in verify"
```

---

### Task 6: Document The Testing Contract

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`

- [x] **Step 1: Add testing guidance to `AGENTS.md`**

Add this section after `## Common Commands`:

```md
## Testing Contract

Every new feature needs both unit and integration coverage.

- Unit tests live next to the TypeScript module or inside Rust `#[cfg(test)]` modules.
- Frontend integration tests live in `tests/integration/` and run through Playwright against Vite.
- Rust integration tests live in `src-tauri/tests/`.
- Use `npm run test:unit` for frontend unit tests.
- Use `npm run test:integration` for browser integration tests.
- Use `cargo test --manifest-path src-tauri/Cargo.toml` for Rust tests.
- Use `mise run verify` before committing.

Do not mock `@inky/galley-editor` in Playwright tests. Unit tests may mock it when testing Galley Pad state management or wrappers.
```

- [x] **Step 2: Add testing commands to `README.md`**

Replace the current frontend test command block with this Markdown content:

Run frontend unit tests:

```bash
npm run test:unit
```

Run browser integration tests:

```bash
npm run test:integration
```

Run Rust unit and integration tests:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

- [x] **Step 3: Run documentation-safe verification**

Run:

```bash
mise run verify
```

Expected:

```txt
0 vulnerabilities
frontend unit tests pass
browser integration tests pass
Rust tests pass
frontend build passes
Tauri debug build passes
```

- [x] **Step 4: Commit**

```bash
git add AGENTS.md README.md
git commit -m "docs: document testing contract"
```

---

### Task 7: Self-Review And Stage 2 Readiness Check

**Files:**
- Inspect: `package.json`
- Inspect: `mise.toml`
- Inspect: `scripts/verify.mjs`
- Inspect: `tests/integration/app.spec.ts`
- Inspect: `src-tauri/tests/scaffold.rs`
- Inspect: `AGENTS.md`

- [x] **Step 1: Confirm every layer has a command**

Run:

```bash
npm run test:unit
npm run test:integration
cargo test --manifest-path src-tauri/Cargo.toml
mise run verify
```

Expected: every command exits `0`.

- [x] **Step 2: Confirm Stage 2 test rule is documented**

Run:

```bash
rg -n "Every new feature needs both unit and integration coverage|tests/integration|src-tauri/tests" AGENTS.md README.md
```

Expected: output includes both `AGENTS.md` and `README.md`.

- [x] **Step 3: Confirm no generated reports were accidentally staged**

Run:

```bash
git status --short
```

Expected: only intentional source, docs, lockfile, and config changes are present before each commit. Generated Playwright reports should not be committed.

- [x] **Step 4: Add generated Playwright output ignores if needed**

If `git status --short` shows `playwright-report/` or `test-results/`, add this to `.gitignore`:

```gitignore
playwright-report/
test-results/
```

Then commit:

```bash
git add .gitignore
git commit -m "chore: ignore playwright test output"
```

- [x] **Step 5: Final verification**

Run:

```bash
mise run verify
git status --short
```

Expected:

```txt
mise run verify exits 0
git status --short prints nothing
```
