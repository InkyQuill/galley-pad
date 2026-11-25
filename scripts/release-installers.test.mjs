import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectInstallers, expectedInstallerNames, releaseClient } from "./release-installers.mjs";

const identity = { repo: "InkyQuill/galley-pad", tag: "v1.9.0", sha: "a".repeat(40), id: "123", token: "test" };
const draft = { id: 123, tag_name: identity.tag, target_commitish: identity.sha, draft: true, assets: [] };

test("rejects release IDs tied to a different tag, commit, or published release", async () => {
  for (const changes of [{ id: 234 }, { draft: false }, { tag_name: "v2.0.0" }, { target_commitish: "b".repeat(40) }]) {
    const client = releaseClient(identity, async () => Response.json({ ...draft, ...changes }));
    await assert.rejects(client.validate(), /draft for v1\.9\.0/);
  }
  assert.throws(() => releaseClient({ ...identity, id: "some-tag" }), /Invalid GitHub release identity/);
});

test("uploads and publishes by exact ID and preserves previously uploaded assets", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "galley-installers-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const present = join(directory, "Galley Pad_1.9.0_x86_64.pkg");
  const missing = join(directory, "Galley Pad_1.9.0_aarch64.pkg");
  writeFileSync(present, "already uploaded");
  writeFileSync(missing, "new arm file");
  const requests = [];
  const client = releaseClient(identity, async (url, options) => {
    const { href } = new URL(url);
    requests.push([options.method ?? "GET", href]);
    if (options.method === "POST") {
      assert.equal(options.headers["content-length"], "12");
      const parts = [];
      for await (const chunk of options.body) parts.push(chunk);
      assert.equal(Buffer.concat(parts).toString(), "new arm file");
      return Response.json({ name: "Galley.Pad_1.9.0_aarch64.pkg", state: "uploaded", size: 12 });
    }
    if (options.method === "PATCH") {
      assert.deepEqual(JSON.parse(options.body), { draft: false });
      return Response.json({ ...draft, draft: false });
    }
    const names = requests.length === 1
      ? ["Galley.Pad_1.9.0_x86_64.pkg"]
      : expectedInstallerNames(identity.tag);
    return Response.json({ ...draft, assets: names.map((name) => ({ name, state: "uploaded", size: 500 })) });
  });
  await client.upload([present, missing]);
  await client.publish();
  assert.deepEqual(requests, [
    ["GET", "https://api.github.com/repos/InkyQuill/galley-pad/releases/123"],
    ["POST", "https://uploads.github.com/repos/InkyQuill/galley-pad/releases/123/assets?name=Galley.Pad_1.9.0_aarch64.pkg"],
    ["GET", "https://api.github.com/repos/InkyQuill/galley-pad/releases/123"],
    ["PATCH", "https://api.github.com/repos/InkyQuill/galley-pad/releases/123"],
  ]);
});

test("rechecks the intended draft if GitHub reports an upload error after saving the file", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "galley-upload-retry-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "Galley Pad_1.9.0_x64-setup.exe");
  writeFileSync(path, "installer");
  const requests = [];
  const client = releaseClient(identity, async (_url, options) => {
    requests.push(options.method ?? "GET");
    if (options.method === "POST") {
      for await (const chunk of options.body) assert.ok(chunk.length);
      return new Response("upload response lost", { status: 502 });
    }
    const assets = requests.length < 3 ? [] : [
      { name: "Galley.Pad_1.9.0_x64-setup.exe", state: "uploaded", size: 9 },
    ];
    return Response.json({ ...draft, assets });
  });
  await client.upload([path]);
  assert.deepEqual(requests, ["GET", "POST", "GET"]);
});

test("blocks publication while an expected artifact is missing or incomplete", async () => {
  const assets = expectedInstallerNames(identity.tag).map((name) => ({ name, state: "uploaded", size: 100 }));
  assets[0].state = "starter";
  assets[0].size = 0;
  const client = releaseClient(identity, async (_url, options) => {
    assert.equal(options.method, undefined);
    return Response.json({ ...draft, assets });
  });
  await assert.rejects(client.publish(), /missing uploaded installers: Galley\.Pad_1\.9\.0_amd64\.deb/);
});

test("a retry can proceed to AUR after the verified release is public", async () => {
  const assets = expectedInstallerNames(identity.tag).map((name) => ({ name, state: "uploaded", size: 100 }));
  const client = releaseClient(identity, async (_url, options) => {
    assert.equal(options.method, undefined);
    return Response.json({ ...draft, draft: false, assets });
  });
  await client.publish();
});

test("requires every Linux package type and picks the exact macOS architecture", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "galley-installers-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));

  assert.throws(() => collectInstallers("linux", directory), /No installers matched .*\.deb/);
  mkdirSync(join(directory, "src-tauri/target/release/bundle/pkg"), { recursive: true });
  for (const arch of ["x86_64", "aarch64"]) {
    writeFileSync(join(directory, `src-tauri/target/release/bundle/pkg/Galley Pad_${arch}.pkg`), arch);
  }
  assert.deepEqual(collectInstallers("macos-aarch64", directory), [
    "src-tauri/target/release/bundle/pkg/Galley Pad_aarch64.pkg",
  ]);
});
