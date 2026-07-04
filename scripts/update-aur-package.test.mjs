import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { releaseDebUrl, updateAurPackage } from "./update-aur-package.mjs";

const CHECKSUM =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test("updates AUR PKGBUILD and .SRCINFO for a release version", async () => {
  const root = await mkdtemp(join(tmpdir(), "galley-pad-aur-"));
  try {
    const packageDir = join(root, "packaging", "aur", "galley-pad-bin");
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      join(packageDir, "PKGBUILD"),
      `pkgname=galley-pad-bin
pkgver=1.0.0
pkgrel=7
source=("\${pkgname}-\${pkgver}.deb::https://github.com/InkyQuill/galley-pad/releases/download/v\${pkgver}/Galley.Pad_\${pkgver}_amd64.deb")
sha256sums=("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
`,
    );

    await updateAurPackage("1.2.3", { root, sha256: CHECKSUM });

    const pkgbuild = await readFile(join(packageDir, "PKGBUILD"), "utf8");
    const srcinfo = await readFile(join(packageDir, ".SRCINFO"), "utf8");

    assert.match(pkgbuild, /^pkgver=1\.2\.3$/m);
    assert.match(pkgbuild, /^pkgrel=1$/m);
    assert.match(pkgbuild, new RegExp(`^sha256sums=\\("${CHECKSUM}"\\)$`, "m"));
    assert.match(srcinfo, /^\tpkgver = 1\.2\.3$/m);
    assert.match(srcinfo, new RegExp(`^\\tsha256sums = ${CHECKSUM}$`, "m"));
    assert.match(
      srcinfo,
      new RegExp(escapeRegExp(releaseDebUrl("1.2.3"))),
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects invalid AUR release versions", async () => {
  await assert.rejects(
    () => updateAurPackage("latest", { sha256: CHECKSUM }),
    /Expected a semantic version/,
  );
});

test("allows AUR package updates when files are already current", async () => {
  const root = await mkdtemp(join(tmpdir(), "galley-pad-aur-current-"));
  try {
    const packageDir = join(root, "packaging", "aur", "galley-pad-bin");
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      join(packageDir, "PKGBUILD"),
      `pkgname=galley-pad-bin
pkgver=1.2.3
pkgrel=1
sha256sums=("${CHECKSUM}")
`,
    );

    await updateAurPackage("1.2.3", { root, sha256: CHECKSUM });

    assert.match(
      await readFile(join(packageDir, "PKGBUILD"), "utf8"),
      /^pkgver=1\.2\.3$/m,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
