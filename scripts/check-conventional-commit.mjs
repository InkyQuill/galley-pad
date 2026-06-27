import { readFileSync } from "node:fs";

const commitMessagePath = process.argv[2];

if (!commitMessagePath) {
  console.error("Usage: node scripts/check-conventional-commit.mjs <commit-message-file>");
  process.exit(2);
}

const message = readFileSync(commitMessagePath, "utf8");
const header = message
  .split(/\r?\n/)
  .find((line) => line.trim() && !line.trimStart().startsWith("#"))
  ?.trim();

const conventionalCommitHeader =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._-]+\))?!?: .{1,}$/;

if (!header || !conventionalCommitHeader.test(header)) {
  console.error("Commit message must use Conventional Commits.");
  console.error("");
  console.error("Expected format:");
  console.error("  type(scope): short description");
  console.error("");
  console.error("Allowed types:");
  console.error("  feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert");
  console.error("");
  console.error("Examples:");
  console.error("  feat(editor): add theme picker");
  console.error("  fix(shell): resolve relative file arguments");
  process.exit(1);
}
