import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  EDITOR_BUILD_STAMP,
  EDITOR_BUILD_LOCK,
  EDITOR_DEPENDENCY_STAMP,
  EDITOR_OUTPUTS,
  shouldInstallEditorDependencies,
  shouldBuildEditor,
  withBuildLock,
} from "./prepare-galley-editor.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "galley-pad-editor-prep-"));
  const editorDir = join(root, "galley-editor");
  await mkdir(join(editorDir, "src"), { recursive: true });
  await writeFile(join(editorDir, "src", "index.ts"), "export const value = 1;\n");
  await writeFile(join(editorDir, "package.json"), "{}\n");
  await writeFile(join(editorDir, "package-lock.json"), "{}\n");
  return { root, editorDir };
}

async function writeOutputs(editorDir, stamp = "abc123") {
  await mkdir(join(editorDir, "dist"), { recursive: true });
  for (const output of EDITOR_OUTPUTS) {
    await writeFile(join(editorDir, output), "built\n");
  }
  await writeFile(join(editorDir, EDITOR_BUILD_STAMP), `${stamp}\n`);
}

test("requires a build when Galley Editor dist outputs are missing", async () => {
  const { editorDir } = await fixture();

  assert.deepEqual(await shouldBuildEditor({ editorDir, gitHead: "abc123" }), {
    build: true,
    reason: "missing dist/index.js",
  });
});

test("skips build when outputs and source stamp match", async () => {
  const { editorDir } = await fixture();
  await writeOutputs(editorDir);

  assert.deepEqual(await shouldBuildEditor({ editorDir, gitHead: "abc123" }), {
    build: false,
    reason: "galley-editor dist is current",
  });
});

test("requires a build when the output stamp belongs to another editor commit", async () => {
  const { editorDir } = await fixture();
  await writeOutputs(editorDir, "old");

  assert.deepEqual(await shouldBuildEditor({ editorDir, gitHead: "new" }), {
    build: true,
    reason: "dist stamp does not match galley-editor HEAD",
  });
});

test("requires a build when editor source is newer than dist outputs", async () => {
  const { editorDir } = await fixture();
  await writeOutputs(editorDir);
  const outputStats = await stat(join(editorDir, "dist", "index.js"));
  const newer = new Date(outputStats.mtimeMs + 10_000);
  await utimes(join(editorDir, "src", "index.ts"), newer, newer);

  assert.deepEqual(await shouldBuildEditor({ editorDir, gitHead: "abc123" }), {
    build: true,
    reason: "editor inputs are newer than dist outputs",
  });
});

test("requires dependency install when editor dependency inputs change", async () => {
  const { editorDir } = await fixture();
  const nodeModules = join(editorDir, "node_modules");
  await mkdir(nodeModules);

  assert.equal(await shouldInstallEditorDependencies(editorDir), true);

  await writeFile(join(nodeModules, EDITOR_DEPENDENCY_STAMP), "stale\n");
  assert.equal(await shouldInstallEditorDependencies(editorDir), true);

  await writeFile(join(editorDir, "package.json"), "{\"name\":\"fixture\"}\n");
  assert.equal(await shouldInstallEditorDependencies(editorDir), true);

  await writeFile(
    join(nodeModules, EDITOR_DEPENDENCY_STAMP),
    `${await dependencyInputsHash(editorDir)}\n`,
  );
  assert.equal(await shouldInstallEditorDependencies(editorDir), false);
});

test("removes a stale Galley Editor build lock before waiting", async () => {
  const { root } = await fixture();
  await writeFile(join(root, EDITOR_BUILD_LOCK), "999999999\n");

  let ran = false;
  await withBuildLock(root, async () => {
    ran = true;
  });

  assert.equal(ran, true);
});

test("removes an abandoned empty Galley Editor build lock after the grace period", async () => {
  const { root } = await fixture();
  const lockPath = join(root, EDITOR_BUILD_LOCK);
  await writeFile(lockPath, "");
  const stale = new Date(Date.now() - 5_000);
  await utimes(lockPath, stale, stale);

  let ran = false;
  await withBuildLock(root, async () => {
    ran = true;
  });

  assert.equal(ran, true);
});

async function dependencyInputsHash(editorDir) {
  const hash = createHash("sha256");
  for (const input of ["package.json", "package-lock.json"]) {
    hash.update(input);
    hash.update("\0");
    hash.update(await readFile(join(editorDir, input)));
    hash.update("\0");
  }
  return hash.digest("hex");
}
