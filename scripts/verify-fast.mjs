import { spawnSync } from "node:child_process";

/**
 * Runs a command and exits the process if it fails.
 * @param {string} command - The command to execute.
 * @param {string[]} args - Arguments to pass to the command.
 * @param {Object} [options={}] - Execution options.
 * @param {string} [options.cwd] - Working directory for the command.
 * @param {boolean} [options.shell] - Whether to run the command in a shell.
 */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd,
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

run("bun", ["run", "test:unit"]);
run("bun", ["run", "test:scripts"]);
run("bun", ["run", "build"]);
run("cargo", ["fmt", "--manifest-path", "src-tauri/Cargo.toml", "--", "--check"]);
run("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml"]);
