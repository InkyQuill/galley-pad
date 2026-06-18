import { spawnSync } from "node:child_process";

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

run("npm", ["audit", "--json"]);
run("npm", ["test"]);
run("npm", ["run", "build"]);
run("cargo", ["fmt", "--manifest-path", "src-tauri/Cargo.toml", "--", "--check"]);
run(process.execPath, ["scripts/tauri-info.mjs"], { shell: false });
run(
  process.execPath,
  [
    "scripts/with-timeout.mjs",
    "120",
    "npm",
    "run",
    "tauri",
    "--",
    "build",
    "--debug",
    "--no-bundle",
  ],
  { shell: false },
);
