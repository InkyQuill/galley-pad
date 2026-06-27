import { spawn } from "node:child_process";
import { cp, mkdir, rm, stat, symlink } from "node:fs/promises";
import { arch as hostArch } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP_NAME = "Galley Pad.app";
const CLI_NAME = "gpad";
const PRODUCT_NAME = "Galley Pad";
const DEFAULT_IDENTIFIER = "net.inkyquill.galley-pad.pkg";
const DEFAULT_VERSION = "0.1.0";

export function defaultPkgPaths({
  profile,
  projectRoot,
  version,
  arch,
}) {
  const targetProfile = profile === "release" ? "release" : "debug";
  const targetRoot = join(projectRoot, "src-tauri", "target", targetProfile);

  return {
    appPath: join(targetRoot, "bundle", "macos", APP_NAME),
    rootDir: join(targetRoot, "pkgroot"),
    outputPath: join(
      targetRoot,
      "bundle",
      "pkg",
      `${PRODUCT_NAME}_${version}_${arch}.pkg`,
    ),
  };
}

export async function stagePackageRoot({
  appPath,
  rootDir,
  appName = APP_NAME,
  cliName = CLI_NAME,
}) {
  await assertAppBundle(appPath, cliName);
  await rm(rootDir, { force: true, recursive: true });

  const stagedAppPath = join(rootDir, "Applications", appName);
  const stagedBinDir = join(rootDir, "usr", "local", "bin");
  await mkdir(dirname(stagedAppPath), { recursive: true });
  await mkdir(stagedBinDir, { recursive: true });

  await cp(appPath, stagedAppPath, { recursive: true });
  await symlink(
    `/Applications/${appName}/Contents/MacOS/${cliName}`,
    join(stagedBinDir, cliName),
  );
}

export function pkgbuildArgs({
  rootDir,
  identifier,
  version,
  outputPath,
}) {
  return [
    "--root",
    rootDir,
    "--identifier",
    identifier,
    "--version",
    version,
    "--install-location",
    "/",
    outputPath,
  ];
}

async function assertAppBundle(appPath, cliName = CLI_NAME) {
  const executable = join(appPath, "Contents", "MacOS", cliName);
  try {
    const appStats = await stat(appPath);
    const executableStats = await stat(executable);
    if (!appStats.isDirectory() || !executableStats.isFile()) {
      throw new Error();
    }
  } catch {
    throw new Error(
      `Expected a built macOS app with ${cliName} at ${executable}. Run npm run tauri -- build --debug --bundles app first.`,
    );
  }
}

async function run(command, args, options = {}) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

function parseArgs(argv) {
  const options = {
    profile: "debug",
    skipAppBuild: false,
    version: DEFAULT_VERSION,
    identifier: DEFAULT_IDENTIFIER,
    projectRoot: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
    arch: tauriArchName(hostArch()),
    appPath: null,
    outputPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--release") {
      options.profile = "release";
    } else if (arg === "--debug") {
      options.profile = "debug";
    } else if (arg === "--skip-app-build") {
      options.skipAppBuild = true;
    } else if (arg === "--app") {
      options.appPath = resolve(requiredValue(argv, ++index, arg));
    } else if (arg === "--out") {
      options.outputPath = resolve(requiredValue(argv, ++index, arg));
    } else if (arg === "--version") {
      options.version = requiredValue(argv, ++index, arg);
    } else if (arg === "--identifier") {
      options.identifier = requiredValue(argv, ++index, arg);
    } else if (arg === "--arch") {
      options.arch = requiredValue(argv, ++index, arg);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function requiredValue(argv, index, option) {
  const value = argv[index];
  if (!value) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function tauriArchName(arch) {
  if (arch === "arm64") {
    return "aarch64";
  }
  if (arch === "x64") {
    return "x86_64";
  }
  return arch;
}

async function main(argv) {
  if (process.platform !== "darwin") {
    throw new Error("macOS pkg packaging requires macOS.");
  }

  const options = parseArgs(argv);
  const defaults = defaultPkgPaths(options);
  const appPath = options.appPath ?? defaults.appPath;
  const outputPath = options.outputPath ?? defaults.outputPath;

  if (!options.skipAppBuild) {
    const buildArgs =
      options.profile === "release"
        ? ["run", "tauri", "--", "build", "--bundles", "app"]
        : ["run", "tauri", "--", "build", "--debug", "--bundles", "app"];
    await run("npm", buildArgs);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await stagePackageRoot({
    appPath,
    rootDir: defaults.rootDir,
  });
  await run(
    "pkgbuild",
    pkgbuildArgs({
      rootDir: defaults.rootDir,
      identifier: options.identifier,
      version: options.version,
      outputPath,
    }),
  );

  console.log(`Created ${outputPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
