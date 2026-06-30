import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import releaseConfig from "../release.config.cjs";

test("semantic-release updates changelog and every build-time version source", () => {
  const pluginEntries = new Map(
    releaseConfig.plugins.map((plugin) =>
      Array.isArray(plugin) ? [plugin[0], plugin[1] ?? {}] : [plugin, {}],
    ),
  );

  assert.deepEqual(releaseConfig.branches, ["main"]);
  assert.equal(releaseConfig.tagFormat, "v${version}");
  assert.equal(
    pluginEntries.get("@semantic-release/changelog").changelogFile,
    "CHANGELOG.md",
  );
  assert.match(
    pluginEntries.get("@semantic-release/exec").prepareCmd,
    /scripts\/sync-release-version\.mjs \$\{nextRelease\.version\}/,
  );
  assert.match(
    pluginEntries.get("@semantic-release/exec").successCmd,
    /released=true/,
  );
  assert.match(
    pluginEntries.get("@semantic-release/exec").successCmd,
    /tag=v\$\{nextRelease\.version\}/,
  );

  const gitAssets = pluginEntries.get("@semantic-release/git").assets;
  assert.deepEqual(
    [
      "CHANGELOG.md",
      "package.json",
      "bun.lock",
      "src-tauri/Cargo.toml",
      "src-tauri/Cargo.lock",
      "src-tauri/tauri.conf.json",
    ].filter((asset) => !gitAssets.includes(asset)),
    [],
  );
});

test("semantic-release treats app change commit types as release-worthy", () => {
  const commitAnalyzer = releaseConfig.plugins.find(
    (plugin) =>
      Array.isArray(plugin) && plugin[0] === "@semantic-release/commit-analyzer",
  )[1];
  const releaseRules = new Map(
    commitAnalyzer.releaseRules
      .filter((rule) => rule.type)
      .map((rule) => [
        rule.scope ? `${rule.type}:${rule.scope}` : rule.type,
        rule.release,
      ]),
  );

  assert.equal(releaseRules.get("feat"), "minor");
  assert.equal(releaseRules.get("chore:release"), false);
  for (const type of [
    "fix",
    "perf",
    "refactor",
    "style",
    "build",
    "ci",
    "chore",
    "docs",
    "test",
  ]) {
    assert.equal(releaseRules.get(type), "patch");
  }
});

test("GitHub release workflows dispatch and upload all installer families", async () => {
  const semanticWorkflow = await readFile(
    ".github/workflows/semantic-release.yml",
    "utf8",
  );
  const buildWorkflow = await readFile(
    ".github/workflows/build-release.yml",
    "utf8",
  );

  assert.match(semanticWorkflow, /actions: write/);
  assert.match(semanticWorkflow, /oven-sh\/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6/);
  assert.match(semanticWorkflow, /bun install --frozen-lockfile/);
  assert.match(semanticWorkflow, /git config --unset core\.hooksPath \|\| true/);
  assert.match(semanticWorkflow, /bunx semantic-release/);
  assert.match(semanticWorkflow, /gh workflow run build-release\.yml --ref main -f tag=/);
  assert.match(semanticWorkflow, /gh run watch "\$RUN_ID" --exit-status --interval 30/);
  assert.match(semanticWorkflow, /AUR_SSH_PRIVATE_KEY is not configured; skipping AUR publish\./);
  assert.match(semanticWorkflow, /node scripts\/update-aur-package\.mjs "\$VERSION"/);
  assert.match(semanticWorkflow, /ssh:\/\/aur@aur\.archlinux\.org\/galley-pad-bin\.git/);
  assert.match(semanticWorkflow, /if ! git clone "\$AUR_REPO" "\$WORK_DIR\/aur"; then/);
  assert.match(semanticWorkflow, /git push origin HEAD:master/);
  assert.match(buildWorkflow, /workflow_dispatch:/);
  assert.match(buildWorkflow, /oven-sh\/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6/);
  assert.match(buildWorkflow, /bun install --frozen-lockfile/);
  assert.match(buildWorkflow, /Validate release tag/);
  assert.equal(
    buildWorkflow.match(/ref: refs\/tags\/\$\{\{ inputs\.tag \}\}/g)?.length,
    3,
  );
  assert.doesNotMatch(semanticWorkflow, /issues: write/);
  assert.doesNotMatch(semanticWorkflow, /pull-requests: write/);
  assert.match(semanticWorkflow, /persist-credentials: false/);
  assert.equal(
    buildWorkflow.match(/persist-credentials: false/g)?.length,
    3,
  );
  for (const workflow of [semanticWorkflow, buildWorkflow]) {
    assert.doesNotMatch(workflow, /uses: [^\n]+@(v\d+|stable|main|master)\b/);
  }
  assert.match(buildWorkflow, /bun run tauri -- build --bundles deb,rpm,appimage/);
  assert.match(buildWorkflow, /bun run tauri -- build --bundles nsis/);
  assert.match(buildWorkflow, /bun run tauri -- build --bundles app,dmg/);
  assert.match(buildWorkflow, /scripts\/build-macos-pkg\.mjs --release --skip-app-build/);

  for (const glob of [
    "src-tauri/target/release/bundle/deb/*.deb",
    "src-tauri/target/release/bundle/rpm/*.rpm",
    "src-tauri/target/release/bundle/appimage/*.AppImage",
    "src-tauri/target/release/bundle/nsis/*.exe",
    "src-tauri/target/release/bundle/dmg/*.dmg",
    "src-tauri/target/release/bundle/pkg/*.pkg",
  ]) {
    assert.match(buildWorkflow, new RegExp(escapeRegExp(glob)));
  }
});

test("Vite build dedupes editor peer dependencies", async () => {
  const viteConfig = await readFile("vite.config.ts", "utf8");

  for (const dependency of [
    "@codemirror/commands",
    "@codemirror/lang-markdown",
    "@codemirror/language",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/highlight",
    "@lezer/markdown",
  ]) {
    assert.match(viteConfig, new RegExp(escapeRegExp(`"${dependency}"`)));
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
