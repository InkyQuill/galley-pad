import { spawnSync } from "node:child_process";

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

run("npm", ["run", "test:unit"]);
run("npm", ["run", "test:scripts"]);
const pythonCommand = process.platform === "win32" ? "py" : "python3";
const pythonArgs =
  process.platform === "win32"
    ? ["-3", "-m", "unittest", "test_core.py"]
    : ["-m", "unittest", "test_core.py"];
run(pythonCommand, pythonArgs, {
  cwd: ".agents/skills/ui-ux-pro-max/scripts",
});
run("npm", ["run", "build"]);
run("cargo", ["fmt", "--manifest-path", "src-tauri/Cargo.toml", "--", "--check"]);
run("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml"]);
