import semver from "semver";

const LATEST_RELEASE_URL =
  "https://api.github.com/repos/InkyQuill/galley-pad/releases/latest";
const RELEASE_TAG_PATH = "/InkyQuill/galley-pad/releases/tag/";

export type AvailableUpdate = { version: string; releaseUrl: string };

const UPDATE_CACHE_KEY = "galley-pad.release-check.v1";
const UPDATE_CACHE_DURATION = 6 * 60 * 60 * 1000;

type UpdateCheckOptions = {
  timeoutMs?: number;
  storage?: Pick<Storage, "getItem" | "setItem">;
  now?: () => number;
};

export async function checkForGitHubUpdate(
  currentVersion: string,
  fetchImpl: typeof fetch = globalThis.fetch,
  { timeoutMs = 4_000, storage = fetchImpl === globalThis.fetch ? browserStorage() : undefined, now = Date.now }: UpdateCheckOptions = {},
): Promise<AvailableUpdate | null> {
  const cached = readCachedRelease(storage, now());
  if (cached) return parseAvailableUpdate(cached, currentVersion);

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = async () => {
      const result = await fetchImpl(LATEST_RELEASE_URL, {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal,
      });
      return result.ok ? (await result.json()) as unknown : null;
    };
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, timeoutMs);
    });
    const release = await Promise.race([request(), timeout]);
    if (storage && isRelease(release) && isReleaseUrl(release.html_url, release.tag_name)) {
      try {
        const { draft, prerelease, tag_name, html_url } = release;
        storage.setItem(UPDATE_CACHE_KEY, JSON.stringify({
          checkedAt: now(), release: { draft, prerelease, tag_name, html_url },
        }));
      } catch {
        // Storage availability does not affect the result of this check.
      }
    }
    return parseAvailableUpdate(release, currentVersion);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function readCachedRelease(storage: UpdateCheckOptions["storage"], now: number): unknown {
  try {
    const stored = storage?.getItem(UPDATE_CACHE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { checkedAt?: unknown; release?: unknown } | null;
    if (typeof parsed?.checkedAt !== "number" || parsed.checkedAt > now ||
        now - parsed.checkedAt >= UPDATE_CACHE_DURATION || !isRelease(parsed.release) ||
        !isReleaseUrl(parsed.release.html_url, parsed.release.tag_name)) return null;
    return parsed.release;
  } catch {
    return null;
  }
}

function parseAvailableUpdate(
  release: unknown,
  currentVersion: string,
): AvailableUpdate | null {
  if (!isRelease(release)) return null;

  const versionTag = release.tag_name.startsWith("v")
    ? release.tag_name.slice(1)
    : release.tag_name;
  if (versionTag !== versionTag.trim() || !/^[0-9]/.test(versionTag)) return null;

  const version = semver.valid(versionTag);
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
