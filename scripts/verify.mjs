import { spawnSync } from "node:child_process";

/**
 * Runs a command and exits the process if it fails.
 * @param {string} command - The command to execute.
 * @param {string[]} args - The command arguments.
 * @param {{ shell?: boolean }} [options] - Execution options.
 * @param {boolean} [options.shell] - Whether to run the command through a shell.
 */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: options.shell ?? process.platform === "win32",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.signal) {
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("bun", ["audit", "--json"]);
run("bun", ["run", "test:unit"]);
run("bun", ["run", "test:scripts"]);
run("bun", ["run", "test:integration"]);
run("bun", ["run", "build"]);
run("cargo", ["fmt", "--manifest-path", "src-tauri/Cargo.toml", "--", "--check"]);
run("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml"]);
run(process.execPath, ["scripts/tauri-info.mjs"], { shell: false });
run(
  process.execPath,
  [
    "scripts/with-timeout.mjs",
    "120",
    "bun",
    "run",
    "tauri",
    "--",
    "build",
    "--debug",
    "--no-bundle",
  ],
  { shell: false },
);
