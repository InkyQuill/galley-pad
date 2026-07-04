module.exports = {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        releaseRules: [
          { breaking: true, release: "major" },
          { type: "feat", release: "minor" },
          { type: "fix", release: "patch" },
          { type: "perf", release: "patch" },
          { type: "refactor", release: "patch" },
          { type: "style", release: "patch" },
          { type: "build", release: "patch" },
          { type: "ci", release: "patch" },
          { type: "chore", scope: "release", release: false },
          { type: "chore", release: "patch" },
          { type: "docs", release: "patch" },
          { type: "test", release: "patch" },
        ],
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
      },
    ],
    [
      "@semantic-release/changelog",
      {
        changelogFile: "CHANGELOG.md",
      },
    ],
    [
      "@semantic-release/exec",
      {
        prepareCmd: "node scripts/sync-release-version.mjs ${nextRelease.version}",
        successCmd:
          'if [ -n "$GITHUB_OUTPUT" ]; then echo "released=true" >> "$GITHUB_OUTPUT"; echo "tag=v${nextRelease.version}" >> "$GITHUB_OUTPUT"; fi',
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: [
          "CHANGELOG.md",
          "package.json",
          "bun.lock",
          "src-tauri/Cargo.toml",
          "src-tauri/Cargo.lock",
          "src-tauri/tauri.conf.json",
        ],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
    [
      "@semantic-release/github",
      {
        successComment: false,
        failComment: false,
      },
    ],
  ],
};
