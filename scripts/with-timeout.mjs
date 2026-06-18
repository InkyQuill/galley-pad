import { spawn } from "node:child_process";

const [secondsArg, command, ...args] = process.argv.slice(2);
const seconds = Number(secondsArg);

if (!Number.isFinite(seconds) || seconds <= 0 || !command) {
  console.error("Usage: node scripts/with-timeout.mjs <seconds> <command> [args...]");
  process.exit(2);
}

const child = spawn(command, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  child.kill();
  setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
}, seconds * 1_000);

child.on("error", (error) => {
  clearTimeout(timer);
  console.error(error.message);
  process.exit(1);
});

child.on("close", (code, signal) => {
  clearTimeout(timer);
  if (timedOut) {
    process.exit(124);
  }
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 0);
});
