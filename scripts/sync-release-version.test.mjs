import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { syncReleaseVersion } from "./sync-release-version.mjs";

test("syncReleaseVersion writes the release version to every build metadata file", async () => {
  const root = await mkdtemp(join(tmpdir(), "galley-pad-version-"));
  try {
    await mkdir(join(root, "src-tauri"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "galley-pad", version: "0.1.0" }, null, 2),
    );
    await writeFile(
      join(root, "src-tauri", "tauri.conf.json"),
      JSON.stringify({ productName: "Galley Pad", version: "0.1.0" }, null, 2),
    );
    await writeFile(
      join(root, "src-tauri", "Cargo.toml"),
      '[package]\nname = "galley-pad"\nversion = "0.1.0"\n',
    );
    await writeFile(
      join(root, "src-tauri", "Cargo.lock"),
      'version = 4\n\n[[package]]\nname = "galley-pad"\nversion = "0.1.0"\n',
    );

    await syncReleaseVersion("1.2.3", root);

    assert.equal(JSON.parse(await readFile(join(root, "package.json"))).version, "1.2.3");
    assert.equal(
      JSON.parse(await readFile(join(root, "src-tauri", "tauri.conf.json"))).version,
      "1.2.3",
    );
    assert.match(await readFile(join(root, "src-tauri", "Cargo.toml"), "utf8"), /version = "1\.2\.3"/);
    assert.match(await readFile(join(root, "src-tauri", "Cargo.lock"), "utf8"), /version = "1\.2\.3"/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("syncReleaseVersion rejects non-semver input", async () => {
  for (const version of [
    "next",
    "01.2.3",
    "1.02.3",
    "1.2.03",
    "1.2.3-01",
    "1.2.3-alpha..1",
    "1.2.3-",
    "1.2.3+",
  ]) {
    await assert.rejects(
      () => syncReleaseVersion(version),
      /Expected a semantic version/,
    );
  }
});

test("syncReleaseVersion updates Cargo.lock package stanzas with CRLF endings", async () => {
  const root = await mkdtemp(join(tmpdir(), "galley-pad-version-crlf-"));
  try {
    await mkdir(join(root, "src-tauri"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "galley-pad", version: "0.1.0" }, null, 2),
    );
    await writeFile(
      join(root, "src-tauri", "tauri.conf.json"),
      JSON.stringify({ productName: "Galley Pad", version: "0.1.0" }, null, 2),
    );
    await writeFile(
      join(root, "src-tauri", "Cargo.toml"),
      '[package]\nname = "galley-pad"\nversion = "0.1.0"\n',
    );
    await writeFile(
      join(root, "src-tauri", "Cargo.lock"),
      'version = 4\r\n\r\n[[package]]\r\nname = "galley-pad"\r\nversion = "0.1.0"\r\n',
    );

    await syncReleaseVersion("1.2.3", root);

    assert.match(
      await readFile(join(root, "src-tauri", "Cargo.lock"), "utf8"),
      /name = "galley-pad"\r?\nversion = "1\.2\.3"/,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
