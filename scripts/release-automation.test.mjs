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
      "package-lock.json",
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
      .map((rule) => [rule.type, rule.release]),
  );

  assert.equal(releaseRules.get("feat"), "minor");
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
  assert.match(semanticWorkflow, /gh workflow run build-release\.yml --ref main -f tag=/);
  assert.match(semanticWorkflow, /gh run watch "\$RUN_ID" --exit-status --interval 30/);
  assert.match(buildWorkflow, /workflow_dispatch:/);
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
  assert.match(buildWorkflow, /npm run tauri -- build --bundles deb,rpm,appimage/);
  assert.match(buildWorkflow, /npm run tauri -- build --bundles nsis/);
  assert.match(buildWorkflow, /npm run tauri -- build --bundles app,dmg/);
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
