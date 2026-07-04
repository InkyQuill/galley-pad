import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { get } from "node:https";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const AUR_PACKAGE = "galley-pad-bin";
const REPOSITORY_URL = "https://github.com/InkyQuill/galley-pad";

export function releaseDebUrl(version) {
  return `${REPOSITORY_URL}/releases/download/v${version}/Galley.Pad_${version}_amd64.deb`;
}

export async function updateAurPackage(
  version,
  { root = PROJECT_ROOT, sha256 } = {},
) {
  assertSemver(version);

  const packageDir = resolve(root, "packaging", "aur", AUR_PACKAGE);
  const checksum = sha256 ?? await downloadSha256(releaseDebUrl(version));

  await updatePkgbuild(resolve(packageDir, "PKGBUILD"), version, checksum);
  await writeFile(
    resolve(packageDir, ".SRCINFO"),
    srcInfo({ version, sha256: checksum }),
  );
}

async function updatePkgbuild(path, version, sha256) {
  const content = await readFile(path, "utf8");
  for (const pattern of [
    /^pkgver=.*$/m,
    /^pkgrel=.*$/m,
    /^sha256sums=\("[0-9a-f]{64}"\)$/m,
  ]) {
    if (!pattern.test(content)) {
      throw new Error(`Could not update AUR PKGBUILD at ${path}`);
    }
  }

  const next = content
    .replace(/^pkgver=.*$/m, `pkgver=${version}`)
    .replace(/^pkgrel=.*$/m, "pkgrel=1")
    .replace(/^sha256sums=\("[0-9a-f]{64}"\)$/m, `sha256sums=("${sha256}")`);

  await writeFile(path, next);
}

function srcInfo({ version, sha256 }) {
  return `pkgbase = ${AUR_PACKAGE}
\tpkgdesc = Desktop Markdown editor for plain .md files
\tpkgver = ${version}
\tpkgrel = 1
\turl = ${REPOSITORY_URL}
\tarch = x86_64
\tlicense = MIT
\tdepends = gtk3
\tdepends = hicolor-icon-theme
\tdepends = webkit2gtk-4.1
\tprovides = galley-pad
\tconflicts = galley-pad
\toptions = !strip
\tsource = ${AUR_PACKAGE}-${version}.deb::${releaseDebUrl(version)}
\tsha256sums = ${sha256}

pkgname = ${AUR_PACKAGE}
`;
}

async function downloadSha256(url) {
  const hash = createHash("sha256");

  await new Promise((resolvePromise, reject) => {
    fetchUrl(url, hash, resolvePromise, reject);
  });

  return hash.digest("hex");
}

function fetchUrl(url, hash, resolvePromise, reject, redirects = 0) {
  const request = get(url, (response) => {
    if (
      response.statusCode &&
      response.statusCode >= 300 &&
      response.statusCode < 400 &&
      response.headers.location
    ) {
      response.resume();
      if (redirects >= 5) {
        reject(new Error(`Too many redirects while downloading ${url}`));
        return;
      }
      fetchUrl(
        response.headers.location,
        hash,
        resolvePromise,
        reject,
        redirects + 1,
      );
      return;
    }

    if (response.statusCode !== 200) {
      response.resume();
      reject(new Error(`Download failed for ${url}: HTTP ${response.statusCode}`));
      return;
    }

    response.on("data", (chunk) => hash.update(chunk));
    response.on("end", resolvePromise);
  });

  request.on("error", reject);
}

function assertSemver(version) {
  if (semver.valid(version) !== version) {
    throw new Error(`Expected a semantic version, received: ${version}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  updateAurPackage(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
