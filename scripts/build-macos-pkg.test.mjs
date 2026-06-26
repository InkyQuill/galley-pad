import assert from "node:assert/strict";
import { mkdir, mkdtemp, readlink, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  defaultPkgPaths,
  pkgbuildArgs,
  stagePackageRoot,
} from "./build-macos-pkg.mjs";

test("stages the app bundle and gpad symlink for a macOS package root", async () => {
  const temp = await mkdtemp(join(tmpdir(), "galley-pad-pkg-"));
  const appPath = join(temp, "Galley Pad.app");
  await mkdir(join(appPath, "Contents", "MacOS"), { recursive: true });
  await writeFile(join(appPath, "Contents", "MacOS", "gpad"), "binary");

  const rootDir = join(temp, "pkgroot");
  await stagePackageRoot({
    appPath,
    rootDir,
    appName: "Galley Pad.app",
    cliName: "gpad",
  });

  assert.ok(
    (await stat(join(rootDir, "Applications", "Galley Pad.app"))).isDirectory(),
  );
  assert.equal(
    await readlink(join(rootDir, "usr", "local", "bin", "gpad")),
    "/Applications/Galley Pad.app/Contents/MacOS/gpad",
  );
});

test("builds pkgbuild arguments for installing at the filesystem root", () => {
  assert.deepEqual(
    pkgbuildArgs({
      rootDir: "/tmp/pkgroot",
      identifier: "net.inkyquill.galley-pad.pkg",
      version: "0.1.0",
      outputPath: "/tmp/Galley Pad_0.1.0_aarch64.pkg",
    }),
    [
      "--root",
      "/tmp/pkgroot",
      "--identifier",
      "net.inkyquill.galley-pad.pkg",
      "--version",
      "0.1.0",
      "--install-location",
      "/",
      "/tmp/Galley Pad_0.1.0_aarch64.pkg",
    ],
  );
});

test("defaults to the debug bundle and pkg output paths", () => {
  const paths = defaultPkgPaths({
    profile: "debug",
    projectRoot: "/repo",
    version: "0.1.0",
    arch: "aarch64",
  });

  assert.equal(
    paths.appPath,
    "/repo/src-tauri/target/debug/bundle/macos/Galley Pad.app",
  );
  assert.equal(
    paths.outputPath,
    "/repo/src-tauri/target/debug/bundle/pkg/Galley Pad_0.1.0_aarch64.pkg",
  );
  assert.equal(paths.rootDir, "/repo/src-tauri/target/debug/pkgroot");
});
