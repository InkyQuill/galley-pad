import { readFileSync } from "node:fs";

const version = readFileSync("version.txt", "utf8").trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error("Invalid release version");
const sources = {
  "package.json": JSON.parse(readFileSync("package.json")).version,
  "tauri.conf.json": JSON.parse(readFileSync("src-tauri/tauri.conf.json")).version,
  "release manifest": JSON.parse(readFileSync(".release-please-manifest.json"))["."],
};
for (const file of ["Cargo.toml", "Cargo.lock"]) {
  sources[file] = readFileSync(`src-tauri/${file}`, "utf8")
    .match(/name = "galley-pad"\r?\nversion = "([^"]+)"/)?.[1];
}
if (process.argv[2]) sources.tag = process.argv[2];
for (const [name, actual] of Object.entries(sources)) {
  if (actual !== version) throw Error(`${name}: expected ${version}, found ${actual}`);
}
