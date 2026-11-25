import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  assert.ok(workflow.includes("skip-github-release: ${{ steps.boundary.outputs.tag_exists == 'true' }}"));
  assert.ok(workflow.includes("skip-github-pull-request: ${{ steps.boundary.outputs.tag_exists == 'false' }}"));
  assert.match(workflow, /gh api --method POST .*git\/refs/);
  assert.match(workflow, /FETCH_HEAD\^\{commit\}/);
  assert.match(workflow, /gh workflow run ci\.yml --ref "\$head"/);
  assert.match(workflow, /gh workflow run build-release\.yml .* -f tag="\$TAG" -f sha="\$RELEASE_SHA" -f release_id="\$release_id"/);
  assert.doesNotMatch(workflow, /semantic-release|--admin|gh pr merge/);
});

test("release PR generation requires the current version's tag on main", async (t) => {
  const repository = await mkdtemp(join(tmpdir(), "galley-release-boundary-"));
  t.after(() => rm(repository, { recursive: true, force: true }));
  const version = (await readFile("version.txt", "utf8")).trim();
  const workflow = await readFile(".github/workflows/release-please.yml", "utf8");
  const boundary = workflow.split("        id: boundary\n        run: |\n")[1]
    .split("      - id: release")[0];
  const output = join(repository, "output");
  const gitEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );

  await mkdir(join(repository, "src-tauri"));
  await mkdir(join(repository, "scripts"));
  for (const file of [
    "version.txt",
    "package.json",
    ".release-please-manifest.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "src-tauri/tauri.conf.json",
    "scripts/check-release-version.mjs",
  ]) {
    await cp(file, join(repository, file));
  }

  function git(...args) {
    const result = spawnSync("git", args, {
      cwd: repository, encoding: "utf8", env: gitEnv,
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }

  function runBoundary() {
    return spawnSync("bash", ["-eu", "-c", boundary], {
      cwd: repository, encoding: "utf8", env: { ...gitEnv, GITHUB_OUTPUT: output },
    });
  }

  git("init", "-q", "--template=");
  git("config", "core.hooksPath", join(repository, "disabled-hooks"));
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Release test");
  git("add", ".");
  git("commit", "-qm", "Release merge");
  const release = git("rev-parse", "HEAD");
  let result = runBoundary();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(output, "utf8"), "tag_exists=false\n");

  git("tag", `v${version}`);
  git("commit", "--allow-empty", "-qm", "Feature merge");
  result = runBoundary();
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(output, "utf8"), /tag_exists=true\n$/);

  git("tag", "-f", `v${version}`);
  git("checkout", "--detach", release);
  assert.notEqual(runBoundary().status, 0);
});

test("changelog starts with the current release and lists releases newest first", async () => {
  const changelog = await readFile("CHANGELOG.md", "utf8");
  const version = (await readFile("version.txt", "utf8")).trim();
  const versions = Array.from(
    changelog.matchAll(/^## (?:\[)?(\d+\.\d+\.\d+)(?:\]| )/gm),
    ([, release]) => release,
  );
  assert.equal(versions[0], version);
  assert.equal(new Set(versions).size, versions.length);
  assert.deepEqual(versions, [...versions].sort((a, b) => b.localeCompare(a, "en", { numeric: true })));
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
  assert.match(workflow, /node \.release-workflow\/scripts\/release-installers\.mjs validate/);
  assert.match(workflow, /node \.release-workflow\/scripts\/release-installers\.mjs publish/);
  assert.equal(workflow.match(/ref: \$\{\{ github.workflow_sha \}\}/g)?.length, 5);
  assert.equal(workflow.match(/RELEASE_ID: \$\{\{ needs.validate.outputs.release_id \}\}/g)?.length, 4);
  assert.match(workflow, /AUR_SSH_PRIVATE_KEY is not configured/);
  assert.doesNotMatch(workflow, /softprops|gh release (create|edit|upload)/);
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
