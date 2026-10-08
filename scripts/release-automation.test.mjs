import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("release-please owns version PRs and explicitly checks the synchronized branch", async () => {
  const config = JSON.parse(await readFile("release-please-config.json", "utf8"));
  assert.equal(config.packages["."]["release-type"], "simple");
  assert.equal(config.packages["."]["version-file"], "version.txt");
  assert.equal(config.packages["."].draft, true);
  const workflow = await readFile(".github/workflows/release-please.yml", "utf8");
  assert.match(workflow, /googleapis\/release-please-action@[a-f0-9]{40}/);
  assert.match(workflow, /scripts\/sync-release-version\.mjs/);
  assert.match(workflow, /gh api --method POST .*git\/refs/);
  assert.match(workflow, /FETCH_HEAD\^\{commit\}/);
  assert.match(workflow, /gh workflow run ci\.yml --ref "\$head"/);
  assert.match(workflow, /gh workflow run build-release\.yml .* -f tag="\$TAG" -f sha="\$RELEASE_SHA"/);
  assert.doesNotMatch(workflow, /semantic-release|--admin|gh pr merge/);
});

test("AUR publication requires a preverified host key when credentials are configured", async () => {
  const workflow = await readFile(".github/workflows/build-release.yml", "utf8");
  const aurStep = workflow.slice(workflow.indexOf("      - name: Publish AUR package"));
  const guard = aurStep.slice(aurStep.indexOf("        run: |") + "        run: |".length, aurStep.indexOf('          VERSION='));
  assert.doesNotMatch(aurStep, /ssh-keyscan/);
  for (const [privateKey, knownHosts, status] of [["", "", 0], ["test-key", "", 1], ["test-key", "preverified-host", 0]]) {
    const result = spawnSync("bash", ["-eu", "-c", guard], {
      encoding: "utf8",
      env: { ...process.env, AUR_SSH_PRIVATE_KEY: privateKey, AUR_SSH_KNOWN_HOSTS: knownHosts },
    });
    assert.equal(result.status, status, result.stderr);
    if (status === 1) assert.match(result.stderr, /preverified AUR host key/);
  }
});

test("checked-in release versions agree", () => {
  const result = spawnSync(process.execPath, ["scripts/check-release-version.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(spawnSync(process.execPath, ["scripts/check-release-version.mjs", "99.0.0"]).status, 0);
});

test("installers use the validated SHA and publish only after all platforms succeed", async () => {
  const workflow = await readFile(".github/workflows/build-release.yml", "utf8");
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_SHA"/);
  assert.equal(workflow.match(/ref: \$\{\{ inputs.sha \}\}/g)?.length, 4);
  assert.match(workflow, /needs: \[validate, linux, windows, macos\]/);
  assert.match(workflow, /gh release edit "\$TAG" --draft=false/);
  assert.match(workflow, /AUR_SSH_PRIVATE_KEY is not configured/);
  for (const family of ["deb/*.deb", "rpm/*.rpm", "appimage/*.AppImage", "nsis/*.exe", "pkg/*.pkg"]) {
    assert.ok(workflow.includes(family));
  }
  assert.doesNotMatch(workflow, /uses: [^\n]+@(v\d+|stable|main|master)\b/);
});

test("Vite build dedupes editor peer dependencies", async () => {
  const viteConfig = await readFile("vite.config.ts", "utf8");

  for (const dependency of [
    "@codemirror/commands",
    "@codemirror/lang-markdown",
    "@codemirror/language",
    "@codemirror/search",
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
