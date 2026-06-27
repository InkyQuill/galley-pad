import { spawnSync } from "node:child_process";
import {
  access,
  copyFile,
  open,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const EDITOR_OUTPUTS = ["dist/index.js", "dist/style.css"];
export const EDITOR_BUILD_STAMP = "dist/.galley-editor-head";
const EDITOR_BUILD_LOCK = ".galley-editor-build.lock";
const LOCK_RETRY_MS = 250;
const LOCK_TIMEOUT_MS = 120_000;

const EDITOR_INPUTS = [
  "src",
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "tsconfig.json",
  "tsconfig.lib.json",
  "postcss.config.js",
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function newestMtime(path) {
  const stats = await stat(path);
  if (!stats.isDirectory()) return stats.mtimeMs;

  const entries = await readdir(path, { withFileTypes: true });
  const childTimes = await Promise.all(
    entries.map((entry) => newestMtime(join(path, entry.name))),
  );
  return Math.max(stats.mtimeMs, ...childTimes);
}

async function latestInputMtime(editorDir) {
  const inputTimes = [];
  for (const input of EDITOR_INPUTS) {
    const path = join(editorDir, input);
    if (await exists(path)) {
      inputTimes.push(await newestMtime(path));
    }
  }
  return Math.max(0, ...inputTimes);
}

async function oldestOutputMtime(editorDir) {
  const outputTimes = await Promise.all(
    EDITOR_OUTPUTS.map(async (output) => (await stat(join(editorDir, output))).mtimeMs),
  );
  return Math.min(...outputTimes);
}

async function readStamp(editorDir) {
  try {
    return (await readFile(join(editorDir, EDITOR_BUILD_STAMP), "utf8")).trim();
  } catch {
    return "";
  }
}

export async function shouldBuildEditor({ editorDir, gitHead }) {
  for (const output of EDITOR_OUTPUTS) {
    if (!(await exists(join(editorDir, output)))) {
      return { build: true, reason: `missing ${output}` };
    }
  }

  if (gitHead && (await readStamp(editorDir)) !== gitHead) {
    return {
      build: true,
      reason: "dist stamp does not match galley-editor HEAD",
    };
  }

  if ((await latestInputMtime(editorDir)) > (await oldestOutputMtime(editorDir))) {
    return {
      build: true,
      reason: "editor inputs are newer than dist outputs",
    };
  }

  return { build: false, reason: "galley-editor dist is current" };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: options.shell ?? process.platform === "win32",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.signal) {
    throw new Error(`${command} exited with signal ${result.signal}`);
  }

  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status ?? 1}`);
  }
}

function runQuiet(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: options.shell ?? process.platform === "win32",
    ...options,
  });

  return result.status === 0 ? result.stdout.trim() : "";
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function ensureEditorCheckout(projectRoot, editorDir) {
  if (await exists(join(editorDir, "package.json"))) return;

  const submodulePath = runQuiet(
    "git",
    ["config", "--file", ".gitmodules", "--get", "submodule.galley-editor.path"],
    { cwd: projectRoot },
  );
  if (submodulePath === "galley-editor") {
    run("git", ["submodule", "update", "--init", "galley-editor"], {
      cwd: projectRoot,
    });
  }

  if (await exists(join(editorDir, "package.json"))) return;

  throw new Error(
    "galley-editor submodule is not initialized. Run `git submodule update --init galley-editor`.",
  );
}

function readGitHead(editorDir) {
  const result = spawnSync("git", ["-C", editorDir, "rev-parse", "HEAD"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) return "";
  return result.stdout.trim();
}

async function ensureEditorDependencies(editorDir) {
  const nodeModules = join(editorDir, "node_modules");
  const stats = await stat(nodeModules).catch(() => null);
  if (stats?.isDirectory()) return;

  run("npm", ["--prefix", editorDir, "ci"]);
}

async function withBuildLock(projectRoot, task) {
  const lockPath = join(projectRoot, EDITOR_BUILD_LOCK);
  const start = Date.now();

  for (;;) {
    let handle;
    try {
      handle = await open(lockPath, "wx");
      await handle.writeFile(`${process.pid}\n`);
      try {
        return await task();
      } finally {
        await handle.close();
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => undefined);
      }

      if (error?.code !== "EEXIST") {
        throw error;
      }

      if (Date.now() - start > LOCK_TIMEOUT_MS) {
        throw new Error("Timed out waiting for Galley Editor build lock.");
      }

      await sleep(LOCK_RETRY_MS);
    }
  }
}

async function writeStamp(editorDir, gitHead) {
  if (!gitHead) return;
  await mkdir(join(editorDir, "dist"), { recursive: true });
  await writeFile(join(editorDir, EDITOR_BUILD_STAMP), `${gitHead}\n`);
}

export async function prepareGalleyEditor({
  projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
} = {}) {
  const editorDir = join(projectRoot, "galley-editor");
  let decision = { build: true, reason: "galley-editor checkout is missing" };

  if (await exists(join(editorDir, "package.json"))) {
    const gitHead = readGitHead(editorDir);
    decision = await shouldBuildEditor({ editorDir, gitHead });

    if (!decision.build) {
      console.log(`Galley Editor: ${decision.reason}.`);
      return decision;
    }
  }

  await withBuildLock(projectRoot, async () => {
    await ensureEditorCheckout(projectRoot, editorDir);
    const gitHead = readGitHead(editorDir);
    decision = await shouldBuildEditor({ editorDir, gitHead });
    if (!decision.build) {
      console.log(`Galley Editor: ${decision.reason}.`);
      return;
    }

    console.log(`Galley Editor: ${decision.reason}; building local dist.`);
    await ensureEditorDependencies(editorDir);
    run("npm", ["--prefix", editorDir, "run", "build:lib"]);
    await copyFile(join(editorDir, "src", "galley-base.css"), join(editorDir, "dist", "style.css"));
    await writeStamp(editorDir, gitHead);

    const verification = await shouldBuildEditor({ editorDir, gitHead });
    if (verification.build) {
      throw new Error(`Galley Editor build did not produce current dist: ${verification.reason}`);
    }
  });

  return decision;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareGalleyEditor().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
