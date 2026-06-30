import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function syncReleaseVersion(version, root = PROJECT_ROOT) {
  assertSemver(version);

  await updateJsonFile(resolve(root, "package.json"), (json) => {
    json.version = version;
  });
  await updateJsonFile(resolve(root, "src-tauri", "tauri.conf.json"), (json) => {
    json.version = version;
  });

  await updateTomlPackageVersion(
    resolve(root, "src-tauri", "Cargo.toml"),
    "galley-pad",
    version,
  );
  await updateCargoLockPackageVersion(
    resolve(root, "src-tauri", "Cargo.lock"),
    "galley-pad",
    version,
  );
}

async function updateJsonFile(path, update) {
  const json = JSON.parse(await readFile(path, "utf8"));
  update(json);
  await writeFile(path, `${JSON.stringify(json, null, 2)}\n`);
}

async function updateTomlPackageVersion(path, packageName, version) {
  const content = await readFile(path, "utf8");
  const packageBlock = new RegExp(
    `(\\[package\\][\\s\\S]*?^name\\s*=\\s*"${escapeRegExp(packageName)}"[\\s\\S]*?^version\\s*=\\s*")([^"]+)(")`,
    "m",
  );
  const next = content.replace(packageBlock, `$1${version}$3`);
  if (next === content) {
    throw new Error(`Could not update ${packageName} version in ${path}`);
  }
  await writeFile(path, next);
}

async function updateCargoLockPackageVersion(path, packageName, version) {
  const content = await readFile(path, "utf8");
  const packageBlock = new RegExp(
    `(\\[\\[package\\]\\]\\r?\\nname\\s*=\\s*"${escapeRegExp(packageName)}"\\r?\\nversion\\s*=\\s*")([^"]+)(")`,
    "m",
  );
  const next = content.replace(packageBlock, `$1${version}$3`);
  if (next === content) {
    throw new Error(`Could not update ${packageName} version in ${path}`);
  }
  await writeFile(path, next);
}

function assertSemver(version) {
  if (semver.valid(version) !== version) {
    throw new Error(`Expected a semantic version, received: ${version}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncReleaseVersion(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
