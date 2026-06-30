import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);

async function checkCommitMessage(message) {
  const temp = await mkdtemp(join(tmpdir(), "galley-pad-commit-msg-"));
  const commitMessagePath = join(temp, "COMMIT_EDITMSG");

  try {
    await writeFile(commitMessagePath, message);
    await execFileAsync("node", [
      "scripts/check-conventional-commit.mjs",
      commitMessagePath,
    ]);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      stderr: error.stderr,
    };
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
}

test("accepts conventional commit messages", async () => {
  assert.deepEqual(await checkCommitMessage("fix(shell): open files\n"), {
    ok: true,
  });
});

test("accepts common Git-generated merge commit messages", async () => {
  for (const message of [
    "Merge branch 'main' into feature/file-tabs\n",
    "Merge pull request #42 from InkyQuill/release-notes\n",
    "Merge remote-tracking branch 'origin/main'\n",
    "Merge tag 'v1.2.3'\n",
    "Merge commit 'abc1234'\n",
  ]) {
    assert.deepEqual(await checkCommitMessage(message), { ok: true });
  }
});

test("rejects non-conventional non-merge commit messages", async () => {
  const result = await checkCommitMessage("updated stuff\n");

  assert.equal(result.ok, false);
  assert.match(result.stderr, /Commit message must use Conventional Commits/);
});
