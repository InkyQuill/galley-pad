import semver from "semver";

const LATEST_RELEASE_URL =
  "https://api.github.com/repos/InkyQuill/galley-pad/releases/latest";
const RELEASE_TAG_PATH = "/InkyQuill/galley-pad/releases/tag/";

export type AvailableUpdate = { version: string; releaseUrl: string };

export async function checkForGitHubUpdate(
  currentVersion: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AvailableUpdate | null> {
  try {
    const result = await fetchImpl(LATEST_RELEASE_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!result.ok) return null;
    return parseAvailableUpdate(await result.json(), currentVersion);
  } catch {
    return null;
  }
}

function parseAvailableUpdate(
  release: unknown,
  currentVersion: string,
): AvailableUpdate | null {
  if (!isRelease(release)) return null;

  const version = semver.clean(release.tag_name);
  if (!version || semver.prerelease(version) || !semver.gt(version, currentVersion)) {
    return null;
  }

  if (!isReleaseUrl(release.html_url, release.tag_name)) return null;

  return { version, releaseUrl: release.html_url };
}

function isRelease(
  value: unknown,
): value is { draft: false; prerelease: false; tag_name: string; html_url: string } {
  if (!value || typeof value !== "object") return false;

  const release = value as Record<string, unknown>;
  return (
    release.draft === false &&
    release.prerelease === false &&
    typeof release.tag_name === "string" &&
    typeof release.html_url === "string"
  );
}

function isReleaseUrl(urlString: string, tag: string): boolean {
  try {
    const url = new URL(urlString);
    return (
      url.origin === "https://github.com" &&
      url.pathname === `${RELEASE_TAG_PATH}${tag}`
    );
  } catch {
    return false;
  }
}
