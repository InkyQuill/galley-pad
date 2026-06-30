import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["scripts/with-timeout.mjs", "30", "bun", "run", "tauri", "--", "info"],
  { stdio: "inherit" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status === 124) {
  console.log("tauri info timed out during network metadata checks; continuing to tauri-build");
  process.exit(0);
}

if (result.signal) {
  process.exit(1);
}

process.exit(result.status ?? 0);
