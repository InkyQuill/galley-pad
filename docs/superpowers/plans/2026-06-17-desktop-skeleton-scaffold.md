# Desktop Skeleton Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]` / `- [x]`) syntax for tracking.

**Goal:** Build the first runnable Galley Pad desktop skeleton: a Tauri + React + TypeScript app that launches and renders Galley Editor as the only main document surface.

**Architecture:** Tauri provides the native desktop shell and Rust entrypoint. React owns the app chrome and renders a single controlled editor component. Galley Editor is consumed from the `@inky` registry and remains the only Markdown editing surface.

**Tech Stack:** Tauri 2, Rust, Vite, React 18, TypeScript, `@inky/galley-editor`, CodeMirror peer dependencies, Vitest, Testing Library.

---

## Scope

This plan implements Stage 1 from `docs/plans/stage-1-desktop-skeleton.md`.

Included:

- Tauri + React + TypeScript scaffold
- npm registry configuration for `@inky`
- Galley Editor package and peer dependencies
- minimal app shell
- single editor surface
- light/dark styling based on system preference
- unit tests for the editor wrapper
- integration tests for the composed app shell and editor flow
- Tauri dev/build verification commands

Excluded:

- file open/save
- native menus
- recent files
- dirty-state tracking
- CLI file argument handling
- file associations
- settings persistence
- external file change detection

## File Structure

Create these files:

- `.gitignore` - ignores dependency, build, Tauri, editor, and OS artifacts.
- `AGENTS.md` - agent guide with setup, verification, and Galley Editor issue routing.
- `mise.toml` - project toolchain and verification task configuration.
- `.npmrc` - points the `@inky` scope to the public GitLab package registry.
- `assets/app-icon.png` - committed app icon source asset.
- `index.html` - Vite HTML entrypoint.
- `package.json` - npm scripts and frontend dependencies.
- `tsconfig.json` - shared TypeScript compiler settings.
- `tsconfig.node.json` - TypeScript settings for Vite config.
- `vite.config.ts` - Vite React and Vitest configuration.
- `scripts/tauri-info.mjs` - portable Tauri info task wrapper for mise.
- `scripts/verify.mjs` - portable sequential verification task for mise.
- `scripts/with-timeout.mjs` - portable Node-based timeout wrapper for mise tasks.
- `src/main.tsx` - React root bootstrap.
- `src/App.tsx` - top-level app shell and document state wiring.
- `src/App.test.tsx` - integration tests for the composed app shell.
- `src/components/DocumentView.tsx` - focused Galley Editor wrapper.
- `src/components/DocumentView.test.tsx` - tests for editor wrapper behavior.
- `src/test/setup.ts` - Testing Library setup.
- `src/styles.css` - app layout, system theme, and editor container styling.
- `src/vite-env.d.ts` - Vite and CSS import declarations for TypeScript.
- `src-tauri/Cargo.toml` - Rust package manifest for the Tauri app.
- `src-tauri/build.rs` - Tauri build script.
- `src-tauri/capabilities/default.json` - baseline Tauri permissions.
- `src-tauri/icons/icon.png` - Tauri icon copied from the committed app icon asset.
- `src-tauri/src/lib.rs` - Tauri application builder.
- `src-tauri/src/main.rs` - native binary entrypoint.
- `src-tauri/tauri.conf.json` - Tauri app configuration.

Modify these files:

- `README.md` - add Stage 1 development commands.

Do not modify these files:

- `docs/vision.md`
- `docs/product-principles.md`
- `docs/architecture.md`
- `docs/roadmap.md`
- `docs/reference/galley-editor.md`

## Task 1: Initialize Frontend Project Files

**Files:**

- Create: `.gitignore`
- Create: `AGENTS.md`
- Create: `assets/app-icon.png`
- Create: `index.html`
- Create: `mise.toml`
- Create: `package.json`
- Create: `scripts/tauri-info.mjs`
- Create: `scripts/verify.mjs`
- Create: `scripts/with-timeout.mjs`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`

- [x] **Step 1: Create `.gitignore`**

Create `.gitignore` with this exact content:

```gitignore
# Dependencies
node_modules/

# Build and test output
dist/
dist-ssr/
coverage/
.vite/

# Tauri/Rust generated output
src-tauri/target/
src-tauri/gen/

# Local configuration and secrets
.env
.env.*
!.env.example

# Editor/OS noise
.DS_Store
Thumbs.db
.idea/
.vscode/

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
```

- [x] **Step 2: Create `index.html`**

Create `index.html` with this exact content:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Galley Pad</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [x] **Step 3: Add `assets/app-icon.png`**

Use the committed PNG app icon at `assets/app-icon.png`. Do not generate this icon from inline shell code.

Run:

```bash
file assets/app-icon.png
```

Expected: `assets/app-icon.png` is reported as PNG image data.

- [x] **Step 4: Create `AGENTS.md`**

Create `AGENTS.md` with this exact content:

````markdown
# Agent Guide

## Project

Galley Pad is a Tauri desktop Markdown editor. The frontend is React + Vite, and the editor surface is wrapped through `@inky/galley-editor`.

## Important Paths

- `src/` - React application code.
- `src/components/DocumentView.tsx` - stable wrapper around `GalleyEditor`.
- `src/test/setup.ts` - Vitest and Testing Library setup.
- `src-tauri/` - Tauri shell, Rust entrypoints, capabilities, and app config.
- `docs/` - product, architecture, roadmap, plans, references, and known issues.
- `docs/known-issues.md` - known Galley Pad verification or environment issues.

## Setup

This project includes a `mise.toml` for toolchain switching. From the project root:

```bash
mise install
```

Install JavaScript dependencies from the lockfile:

```bash
npm ci
```

For dependency updates during scaffold work, use `npm install` so `package.json` and `package-lock.json` stay in sync.

## Common Commands

Run frontend tests:

```bash
npm test
```

Build the frontend:

```bash
npm run build
```

Check Rust formatting:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

Print Tauri environment and config info:

```bash
node scripts/with-timeout.mjs 30 npm run tauri -- info
```

Build the Tauri debug app without bundling:

```bash
node scripts/with-timeout.mjs 120 npm run tauri -- build --debug --no-bundle
```

Run the desktop app during development:

```bash
npm run tauri:dev
```

Check npm advisories:

```bash
npm audit --json
```

Run the full verification suite through mise:

```bash
mise run verify
```

## Verification Notes

- `npm run tauri -- info` checks Tauri/Rust package metadata over the network and can stall before printing output. Use the Node timeout wrapper above and continue with `tauri-build` if it exits with timeout code 124.
- The app uses TypeScript 6, Vite 8, and Vitest 4. Keep `moduleResolution` set to `Bundler`.
- CSS side-effect imports are declared in `src/vite-env.d.ts`.
- Tauri CSP is enabled in `src-tauri/tauri.conf.json`; do not set `security.csp` back to `null`.
- Vite `envPrefix` must not expose all `TAURI_` variables. Keep it restricted to `TAURI_ENV_`.

## Galley Editor Boundary

Treat `@inky/galley-editor` as an external editor package. Keep Galley Pad-specific integration code in `DocumentView`.

If an implementation concern appears to be inside Galley Editor itself, do not work around it silently in this repo. If `../galley-editor` exists, record the concern in `../galley-editor/known-issues.md` with:

- observed behavior
- expected behavior
- reproduction steps
- Galley Pad impact
- next action

If `../galley-editor` does not exist, record the concern in `docs/known-issues.md` and make clear that it belongs to the Galley Editor package.
````

- [x] **Step 5: Create `scripts/with-timeout.mjs`**

Create `scripts/with-timeout.mjs` with this exact content:

```js
import { spawn } from "node:child_process";

const [secondsArg, command, ...args] = process.argv.slice(2);
const seconds = Number(secondsArg);

if (!Number.isFinite(seconds) || seconds <= 0 || !command) {
  console.error("Usage: node scripts/with-timeout.mjs <seconds> <command> [args...]");
  process.exit(2);
}

const child = spawn(command, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  child.kill();
  setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
}, seconds * 1_000);

child.on("error", (error) => {
  clearTimeout(timer);
  console.error(error.message);
  process.exit(1);
});

child.on("close", (code, signal) => {
  clearTimeout(timer);
  if (timedOut) {
    process.exit(124);
  }
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 0);
});
```

- [x] **Step 6: Create `scripts/tauri-info.mjs`**

Create `scripts/tauri-info.mjs` with this exact content:

```js
import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["scripts/with-timeout.mjs", "30", "npm", "run", "tauri", "--", "info"],
  { stdio: "inherit" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status === 124) {
  console.log("tauri info timed out during network metadata checks; continuing to tauri-build");
  process.exit(0);
}

if (result.signal) {
  process.exit(1);
}

process.exit(result.status ?? 0);
```

- [x] **Step 7: Create `scripts/verify.mjs`**

Create `scripts/verify.mjs` with this exact content:

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
run("npm", ["test"]);
run("npm", ["run", "build"]);
run("cargo", ["fmt", "--manifest-path", "src-tauri/Cargo.toml", "--", "--check"]);
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

- [x] **Step 8: Create `mise.toml`**

Create `mise.toml` with this exact content:

```toml
[tools]
node = "26"
rust = "stable"

[tasks.install]
description = "Install JavaScript dependencies from package-lock.json"
run = "npm ci"

[tasks.test]
description = "Run frontend tests"
run = "npm test"

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
description = "Run the scaffold verification suite"
run = "node scripts/verify.mjs"
```

- [x] **Step 9: Create `package.json`**

Create `package.json` with this exact content:

```json
{
  "name": "galley-pad",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  },
  "dependencies": {
    "@codemirror/commands": "^6.10.0",
    "@codemirror/lang-markdown": "^6.5.0",
    "@codemirror/language": "^6.12.0",
    "@codemirror/state": "^6.6.0",
    "@codemirror/view": "^6.41.0",
    "@inky/galley-editor": "0.9.1",
    "@lezer/highlight": "^1.2.0",
    "@lezer/markdown": "^1.6.0",
    "@tauri-apps/api": "^2.11.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.11.2",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^6.0.2",
    "jsdom": "^29.1.1",
    "typescript": "^6.0.3",
    "vite": "^8.0.16",
    "vitest": "^4.1.9"
  }
}
```

- [x] **Step 10: Create `tsconfig.json`**

Create `tsconfig.json` with this exact content:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2020"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom/vitest"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [x] **Step 11: Create `tsconfig.node.json`**

Create `tsconfig.node.json` with this exact content:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [x] **Step 12: Create `vite.config.ts`**

Create `vite.config.ts` with this exact content:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    strictPort: true,
    port: 1420,
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
```

- [x] **Step 13: Commit frontend project config**

Run:

```bash
git add .gitignore AGENTS.md assets/app-icon.png index.html mise.toml package.json scripts/tauri-info.mjs scripts/verify.mjs scripts/with-timeout.mjs tsconfig.json tsconfig.node.json vite.config.ts
git commit -m "chore: initialize frontend scaffold"
```

Expected: if the repository has not been initialized, `git commit` fails with `fatal: not a git repository`. In that case, skip only the commit step and continue. Do not initialize git unless the user has asked for it.

## Task 2: Configure Galley Registry And Install Dependencies

**Files:**

- Create: `.npmrc`
- Create after install: `package-lock.json`
- Modify after install: `node_modules/`

- [x] **Step 1: Create `.npmrc`**

Create `.npmrc` with this exact content:

```ini
@inky:registry=https://git.inkyquill.net/api/v4/packages/npm/
```

- [x] **Step 2: Install npm dependencies**

Run:

```bash
npm install
```

Expected:

- `package-lock.json` is created.
- `node_modules/` is created.
- `@inky/galley-editor` installs from `https://git.inkyquill.net/api/v4/packages/npm/`.

If install fails because `@inky/galley-editor@^0.1.0` does not exist, inspect the available package version with:

```bash
npm view @inky/galley-editor version
```

Then update only the `@inky/galley-editor` version in `package.json` to the reported version and run `npm install` again.

- [x] **Step 3: Verify package metadata**

Run:

```bash
npm ls @inky/galley-editor react react-dom @codemirror/state @codemirror/view
```

Expected: npm prints the installed dependency tree without `missing` or `invalid` entries.

- [x] **Step 4: Commit dependency setup**

Run:

```bash
git add .npmrc package.json package-lock.json
git commit -m "chore: configure galley editor dependency"
```

Expected: if the repository has not been initialized, `git commit` fails with `fatal: not a git repository`. In that case, skip only the commit step and continue.

## Task 3: Add React App Shell And Editor Wrapper

**Files:**

- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/components/DocumentView.tsx`
- Create: `src/styles.css`
- Create: `src/vite-env.d.ts`

- [x] **Step 1: Create `src/components/DocumentView.tsx`**

Create `src/components/DocumentView.tsx` with this exact content:

```tsx
import { GalleyEditor } from "@inky/galley-editor";

export type DocumentViewProps = {
  content: string;
  onContentChange: (content: string) => void;
};

export function DocumentView({ content, onContentChange }: DocumentViewProps) {
  return (
    <main className="document-view" aria-label="Markdown document editor">
      <GalleyEditor value={content} onChange={onContentChange} />
    </main>
  );
}
```

If TypeScript reports that `GalleyEditor` does not accept `value` and `onChange`, inspect the package types:

```bash
rg -n "type GalleyEditor|interface GalleyEditor|GalleyEditorProps|onChange|value" node_modules/@inky/galley-editor
```

Then adapt only `DocumentView.tsx` to the actual exported prop names. Keep the component contract `content` and `onContentChange` unchanged so the rest of the app remains stable.

- [x] **Step 2: Create `src/App.tsx`**

Create `src/App.tsx` with this exact content:

```tsx
import { useMemo, useState } from "react";
import { DocumentView } from "./components/DocumentView";

const INITIAL_DOCUMENT = `# Untitled

Start writing Markdown.
`;

export default function App() {
  const [content, setContent] = useState(INITIAL_DOCUMENT);

  const wordCount = useMemo(() => {
    const words = content
      .trim()
      .split(/\s+/)
      .filter((word) => /[A-Za-z0-9]/.test(word));
    return words.length;
  }, [content]);

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="document-title">
          <span className="document-name">Untitled.md</span>
          <span className="document-state">Draft</span>
        </div>
        <div className="document-meta" aria-label="Document statistics">
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </div>
      </header>

      <DocumentView content={content} onContentChange={setContent} />
    </div>
  );
}
```

- [x] **Step 3: Create `src/main.tsx`**

Create `src/main.tsx` with this exact content:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "@inky/galley-editor/style.css";
import "./styles.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [x] **Step 4: Create `src/styles.css`**

Create `src/styles.css` with this exact content:

```css
:root {
  color-scheme: light dark;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  background: #f6f4ef;
  color: #1f2523;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  width: 100%;
  height: 100%;
  margin: 0;
}

body {
  min-width: 320px;
  overflow: hidden;
}

button,
input,
textarea {
  font: inherit;
}

.app-shell {
  display: grid;
  grid-template-rows: 44px minmax(0, 1fr);
  width: 100%;
  height: 100%;
  background: #f6f4ef;
  color: #1f2523;
}

.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
  padding: 0 16px;
  border-bottom: 1px solid #d8d3c8;
  background: #eeebe4;
}

.document-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.document-name {
  overflow: hidden;
  color: #1b211f;
  font-size: 14px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-state,
.document-meta {
  color: #69726e;
  font-size: 12px;
}

.document-meta {
  flex: 0 0 auto;
}

.document-view {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #fbfaf7;
}

.document-view > * {
  height: 100%;
}

@media (prefers-color-scheme: dark) {
  :root {
    background: #191c1b;
    color: #e8e3da;
  }

  .app-shell {
    background: #191c1b;
    color: #e8e3da;
  }

  .titlebar {
    border-bottom-color: #343936;
    background: #202422;
  }

  .document-name {
    color: #f1ece3;
  }

  .document-state,
  .document-meta {
    color: #a8b0ac;
  }

  .document-view {
    background: #171a19;
  }
}
```

- [x] **Step 5: Create `src/vite-env.d.ts`**

Create `src/vite-env.d.ts` with this exact content:

```ts
/// <reference types="vite/client" />

declare module "*.css";
```

- [x] **Step 6: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: build completes and writes frontend output to `dist/`.

If TypeScript fails on `GalleyEditor` prop names, complete the package type inspection from Task 3 Step 1, adapt `DocumentView.tsx`, and rerun `npm run build`.

- [x] **Step 7: Commit app shell**

Run:

```bash
git add src/main.tsx src/App.tsx src/components/DocumentView.tsx src/styles.css src/vite-env.d.ts
git commit -m "feat: render galley editor shell"
```

Expected: if the repository has not been initialized, `git commit` fails with `fatal: not a git repository`. In that case, skip only the commit step and continue.

## Task 4: Add Frontend Tests

**Files:**

- Create: `src/test/setup.ts`
- Create: `src/components/DocumentView.test.tsx`
- Create: `src/App.test.tsx`

- [x] **Step 1: Create Testing Library setup**

Create `src/test/setup.ts` with this exact content:

```ts
import "@testing-library/jest-dom/vitest";
```

- [x] **Step 2: Create failing `DocumentView` unit tests**

Create `src/components/DocumentView.test.tsx` with this exact content:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentView } from "./DocumentView";

vi.mock("@inky/galley-editor", () => ({
  GalleyEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (content: string) => void;
  }) => (
    <textarea
      aria-label="Mock Galley Editor"
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));

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

- [x] **Step 3: Create failing `App` integration tests**

Create `src/App.test.tsx` with this exact content:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@inky/galley-editor", () => ({
  GalleyEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (content: string) => void;
  }) => (
    <textarea
      aria-label="Mock Galley Editor"
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));

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

- [x] **Step 4: Run tests to verify they fail before implementation if Task 3 has not been applied**

If `src/App.tsx` and `src/components/DocumentView.tsx` do not exist yet, run:

```bash
npm test
```

Expected: tests fail because `./App` or `./components/DocumentView` cannot be imported.

If Task 3 has already been applied, run:

```bash
npm test
```

Expected: tests pass. Record in the task notes that the test-first red phase was not possible for the already-created scaffold files, and do not add more production behavior without a failing test first.

Completion note: Task 3 had already been applied when this plan was rechecked, so the red phase was not reproducible; `npm test` passed with the existing scaffold implementation.

- [x] **Step 5: Run frontend unit and integration tests**

Run:

```bash
npm test
```

Expected: `DocumentView` unit tests and `App` integration tests pass.

- [x] **Step 6: Run frontend build again**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build pass.

- [x] **Step 7: Commit frontend tests**

Run:

```bash
git add src/test/setup.ts src/components/DocumentView.test.tsx src/App.test.tsx
git commit -m "test: cover scaffold editor behavior"
```

Expected: if the repository has not been initialized, `git commit` fails with `fatal: not a git repository`. In that case, skip only the commit step and continue.

## Task 4A: Conditional Fix - Only If Task 4 Tests Fail

This is a conditional fallback step, not part of the required sequential path. Execute Task 4A only if the Task 4 tests fail and inspection shows the Task 3 implementation is incomplete or incorrect. If Task 4 passes, skip this entire section and continue to Task 5.

Completion note: Task 4 tests pass, so Task 4A was completed as a skipped fallback. No app shell implementation changes were required here.

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/components/DocumentView.tsx`
- Test: `src/App.test.tsx`
- Test: `src/components/DocumentView.test.tsx`

- [x] **Step 1: Run the focused frontend tests**

Run:

```bash
npm test -- src/App.test.tsx src/components/DocumentView.test.tsx
```

Expected: both test files pass if Task 3 already matches the specified behavior.

- [x] **Step 2: If tests fail because implementation is missing, create `DocumentView`**

If `src/components/DocumentView.tsx` is missing or does not satisfy the tests, replace it with this exact content:

```tsx
import { GalleyEditor } from "@inky/galley-editor";

export type DocumentViewProps = {
  content: string;
  onContentChange: (content: string) => void;
};

export function DocumentView({ content, onContentChange }: DocumentViewProps) {
  return (
    <main className="document-view" aria-label="Markdown document editor">
      <GalleyEditor value={content} onChange={onContentChange} />
    </main>
  );
}
```

If TypeScript reports that `GalleyEditor` does not accept `value` and `onChange`, inspect the package types:

```bash
rg -n "type GalleyEditor|interface GalleyEditor|GalleyEditorProps|onChange|value" node_modules/@inky/galley-editor
```

Then adapt only the `GalleyEditor` prop usage inside `DocumentView.tsx`. Keep `DocumentViewProps` unchanged.

- [x] **Step 3: If tests fail because implementation is missing, create `App`**

If `src/App.tsx` is missing or does not satisfy the tests, replace it with this exact content:

```tsx
import { useMemo, useState } from "react";
import { DocumentView } from "./components/DocumentView";

const INITIAL_DOCUMENT = `# Untitled

Start writing Markdown.
`;

export default function App() {
  const [content, setContent] = useState(INITIAL_DOCUMENT);

  const wordCount = useMemo(() => {
    const words = content
      .trim()
      .split(/\s+/)
      .filter((word) => /[A-Za-z0-9]/.test(word));
    return words.length;
  }, [content]);

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="document-title">
          <span className="document-name">Untitled.md</span>
          <span className="document-state">Draft</span>
        </div>
        <div className="document-meta" aria-label="Document statistics">
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </div>
      </header>

      <DocumentView content={content} onContentChange={setContent} />
    </div>
  );
}
```

- [x] **Step 4: Re-run focused frontend tests**

Run:

```bash
npm test -- src/App.test.tsx src/components/DocumentView.test.tsx
```

Expected: `DocumentView` unit tests and `App` integration tests pass.

- [x] **Step 5: Commit implementation fixes if any were needed**

Run:

```bash
git add src/App.tsx src/components/DocumentView.tsx
git commit -m "fix: satisfy scaffold editor tests"
```

Expected: if no implementation files changed, there is nothing to commit. If the repository has not been initialized, `git commit` fails with `fatal: not a git repository`; skip only the commit step and continue.

- [x] **Step 6: Run frontend build again**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build pass.

## Task 5: Add Tauri Shell

**Files:**

- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/icons/icon.png`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/tauri.conf.json`

- [x] **Step 1: Create Tauri directories**

Run:

```bash
mkdir -p src-tauri/src src-tauri/capabilities src-tauri/icons
```

Expected: `src-tauri/src/`, `src-tauri/capabilities/`, and `src-tauri/icons/` exist.

- [x] **Step 2: Create `src-tauri/Cargo.toml`**

Create `src-tauri/Cargo.toml` with this exact content:

```toml
[package]
name = "galley-pad"
version = "0.1.0"
description = "A simple desktop Markdown editor powered by Galley."
authors = ["Inky Quill"]
edition = "2021"

[lib]
name = "galley_pad_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [x] **Step 3: Create `src-tauri/build.rs`**

Create `src-tauri/build.rs` with this exact content:

```rust
fn main() {
    tauri_build::build()
}
```

- [x] **Step 4: Create `src-tauri/src/lib.rs`**

Create `src-tauri/src/lib.rs` with this exact content:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Galley Pad");
}
```

- [x] **Step 5: Create `src-tauri/src/main.rs`**

Create `src-tauri/src/main.rs` with this exact content:

```rust
fn main() {
    galley_pad_lib::run();
}
```

- [x] **Step 6: Create `src-tauri/capabilities/default.json`**

Create `src-tauri/capabilities/default.json` with this exact content:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default permissions for the main Galley Pad window.",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

- [x] **Step 7: Create `src-tauri/tauri.conf.json`**

Create `src-tauri/tauri.conf.json` with this exact content:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Galley Pad",
  "version": "0.1.0",
  "identifier": "net.inkyquill.galley-pad",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://127.0.0.1:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Galley Pad",
        "label": "main",
        "width": 980,
        "height": 720,
        "minWidth": 640,
        "minHeight": 420,
        "resizable": true
      }
    ],
    "security": {
      "csp": {
        "default-src": "'self'",
        "connect-src": "ipc: http://ipc.localhost",
        "img-src": "'self' asset: http://asset.localhost data:",
        "style-src": "'self'"
      }
    }
  },
  "bundle": {
    "active": false,
    "targets": "all",
    "icon": []
  }
}
```

- [x] **Step 8: Create Tauri icon from committed app icon**

Create `src-tauri/icons/icon.png` by copying the committed app icon asset. Tauri requires a valid PNG at this path during context generation.

Run:

```bash
cp assets/app-icon.png src-tauri/icons/icon.png
```

Expected: `src-tauri/icons/icon.png` exists and is a PNG file matching `assets/app-icon.png`.

- [x] **Step 9: Verify Rust formatting**

Run:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

Expected: formatting check passes.

- [x] **Step 10: Verify Tauri config**

Run:

```bash
node scripts/with-timeout.mjs 30 npm run tauri -- info
```

Expected: Tauri prints environment and app information without config parse errors. This command performs network package metadata checks and can exceed short timeouts; keep the Node timeout wrapper, and if it exits with timeout code 124, continue with the remaining verification and record or reference the issue in `docs/known-issues.md`.

- [x] **Step 11: Commit Tauri shell**

Run:

```bash
git add src-tauri
git commit -m "chore: add tauri desktop shell"
```

Expected: if the repository has not been initialized, `git commit` fails with `fatal: not a git repository`. In that case, skip only the commit step and continue.

## Task 6: Update README With Development Commands

**Files:**

- Modify: `README.md`

- [x] **Step 1: Add development section to `README.md`**

Append this exact section to `README.md`:

````markdown

## Development

Install and activate project toolchains:

```bash
mise install
```

Install dependencies:

```bash
npm install
```

Run frontend tests:

```bash
npm test
```

Build the frontend:

```bash
npm run build
```

Run the desktop app in development:

```bash
npm run tauri:dev
```

Run the full verification suite:

```bash
mise run verify
```
````

- [x] **Step 2: Verify README links and commands**

Run:

```bash
rg -n "mise install|npm install|npm test|npm run build|npm run tauri:dev|mise run verify" README.md
```

Expected: all six development commands are present.

- [x] **Step 3: Commit README update**

Run:

```bash
git add README.md
git commit -m "docs: add scaffold development commands"
```

Expected: if the repository has not been initialized, `git commit` fails with `fatal: not a git repository`. In that case, skip only the commit step and continue.

## Task 7: Verify Stage 1 End To End

**Files:**

- Read: `README.md`
- Read: `docs/plans/stage-1-desktop-skeleton.md`
- Read: `package.json`
- Read: `src/App.tsx`
- Read: `src/components/DocumentView.tsx`
- Read: `src-tauri/tauri.conf.json`

- [x] **Step 1: Run tests**

Run:

```bash
npm test
```

Expected: all Vitest tests pass.

- [x] **Step 2: Run frontend production build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build pass.

- [x] **Step 3: Run Rust formatting check**

Run:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

Expected: formatting check passes.

- [x] **Step 4: Run Tauri information check**

Run:

```bash
node scripts/with-timeout.mjs 30 npm run tauri -- info
```

Expected: Tauri reports app and environment information without configuration errors. This command performs network package metadata checks and can exceed short timeouts; keep the Node timeout wrapper. If it exits with timeout code 124, continue with the rest of verification and reference `docs/known-issues.md`.

- [x] **Step 5: Launch the desktop app**

Run:

```bash
npm run tauri:dev
```

Expected:

- Vite starts on `http://127.0.0.1:1420`.
- A native window titled `Galley Pad` opens.
- The first visible screen is the editor surface.
- The editor shows the starter Markdown text.
- Typing into the editor changes the document content.
- There is no sidebar, dashboard, project tree, or workspace prompt.

- [x] **Step 6: Stop the dev app**

Stop the running Tauri process with `Ctrl+C` in the terminal where `npm run tauri:dev` is running.

Expected: the dev server and Tauri process exit cleanly.

- [x] **Step 7: Record known Stage 1 issues**

If any of the verification commands fail, create `docs/known-issues.md` with this exact structure and fill in only observed failures. A `node scripts/with-timeout.mjs 30 npm run tauri -- info` timeout with exit code 124 is an expected network or environment issue; if it occurs, document it here and continue with verification instead of blocking indefinitely.

```markdown
# Known Issues

## Stage 1 Desktop Skeleton

- Command:
- Expected:
- Actual:
- Owner:
- Next action:
```

If all commands pass and the expected Tauri info hang does not occur, do not create `docs/known-issues.md`.

## Self-Review Checklist

- [x] Stage 1 scope is covered: scaffold, registry, install, editor render, theme, unit tests, integration tests, verification.
- [x] Stage 2 behavior is excluded: no open/save, dirty state, native dialogs, recent files, or CLI handling.
- [x] The React app has a stable `DocumentView` boundary around Galley Editor.
- [x] The plan uses exact paths and exact command lines.
- [x] The plan has no `TBD`, `TODO`, `FIXME`, or vague placeholder steps.
- [x] The plan warns that git commit steps are skipped if the folder is not a git repository.
