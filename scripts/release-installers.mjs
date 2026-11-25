import { createReadStream, globSync, statSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const patternsByPlatform = {
  linux: [
    "src-tauri/target/release/bundle/deb/*.deb",
    "src-tauri/target/release/bundle/rpm/*.rpm",
    "src-tauri/target/release/bundle/appimage/*.AppImage",
    "packaging/aur/galley-pad-bin/*.pkg.tar.zst",
  ],
  windows: ["src-tauri/target/release/bundle/nsis/*.exe"],
  "macos-x86_64": ["src-tauri/target/release/bundle/pkg/*_x86_64.pkg"],
  "macos-aarch64": ["src-tauri/target/release/bundle/pkg/*_aarch64.pkg"],
};

export function expectedInstallerNames(tag) {
  const version = tag.slice(1);
  return [
    `Galley.Pad_${version}_amd64.deb`,
    `Galley.Pad-${version}-1.x86_64.rpm`,
    `Galley.Pad_${version}_amd64.AppImage`,
    `galley-pad-bin-${version}-1-x86_64.pkg.tar.zst`,
    `Galley.Pad_${version}_x64-setup.exe`,
    `Galley.Pad_${version}_x86_64.pkg`,
    `Galley.Pad_${version}_aarch64.pkg`,
  ];
}

function uploadedInstaller(asset) {
  return asset?.state === "uploaded" && asset.size > 0;
}

export function releaseClient({ repo, tag, sha, id, token }, fetcher = fetch) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[1-9]\d*$/.test(id) || !/^[a-f0-9]{40}$/.test(sha) || !token) {
    throw new Error("Invalid GitHub release identity or missing token");
  }

  const repoPath = `/repos/${repo}`;
  const releaseUrl = `https://api.github.com${repoPath}/releases/${id}`;
  const uploadUrl = `https://uploads.github.com${repoPath}/releases/${id}/assets`;

  async function request(url, options = {}) {
    const response = await fetcher(url, {
      ...options,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
        ...options.headers,
      },
      redirect: "error",
    });
    if (!response.ok) {
      throw new Error(`GitHub ${options.method ?? "GET"} ${new URL(url).pathname} failed (${response.status}): ${await response.text()}`);
    }
    return response.status === 204 ? undefined : response.json();
  }

  async function readRelease(requireDraft) {
    const release = await request(releaseUrl);
    if (
      String(release.id) !== id || release.tag_name !== tag ||
      release.target_commitish !== sha || (requireDraft && !release.draft)
    ) {
      throw new Error(`Release ${id} must be the ${requireDraft ? "draft" : "release"} for ${tag} at ${sha}`);
    }
    return release;
  }

  async function upload(files) {
    const release = await readRelease(true);
    for (const file of files) {
      const name = basename(file).replaceAll(" ", ".");
      const size = statSync(file).size;
      if (size <= 0) throw new Error(`Installer is empty: ${file}`);
      if (!expectedInstallerNames(tag).includes(name)) {
        throw new Error(`Unexpected installer name: ${name}`);
      }

      const existing = release.assets.find((asset) => asset.name === name);
      if (uploadedInstaller(existing)) {
        console.log(`Keeping uploaded installer ${name}`);
        continue;
      }
      if (existing) {
        throw new Error(`Incomplete asset ${name} on release ${id} (asset ID ${existing.id})`);
      }

      const url = new URL(uploadUrl);
      url.searchParams.set("name", name);
      try {
        const uploaded = await request(url, {
          method: "POST",
          headers: { "content-type": "application/octet-stream", "content-length": String(size) },
          duplex: "half",
          body: createReadStream(file),
        });
        if (uploaded.name !== name || uploaded.state !== "uploaded" || uploaded.size !== size) {
          throw new Error(`GitHub did not complete the upload for ${name}`);
        }
      } catch (error) {
        const refreshed = await readRelease(true).catch(() => undefined);
        const uploaded = refreshed?.assets.find((asset) => asset.name === name);
        if (!uploadedInstaller(uploaded) || uploaded.size !== size) throw error;
      }
      console.log(`Uploaded ${name} to release ${id}`);
    }
  }

  async function publish() {
    const release = await readRelease(false);
    const available = new Set(release.assets.filter(uploadedInstaller).map(({ name }) => name));
    const missing = expectedInstallerNames(tag).filter((name) => !available.has(name));
    if (missing.length) {
      throw new Error(`Release ${id} is missing uploaded installers: ${missing.join(", ")}`);
    }
    if (!release.draft) {
      console.log(`Release ${id} is already public`);
      return;
    }
    const published = await request(releaseUrl, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft: false }),
    });
    if (String(published.id) !== id || published.tag_name !== tag || published.draft) {
      throw new Error(`GitHub did not publish release ${id}`);
    }
  }

  return { validate: () => readRelease(true), upload, publish };
}

export function collectInstallers(platform, cwd = process.cwd()) {
  if (!Object.hasOwn(patternsByPlatform, platform)) throw new Error(`Unknown installer platform: ${platform}`);

  return patternsByPlatform[platform].flatMap((pattern) => {
    const matches = globSync(pattern, { cwd });
    if (!matches.length) throw new Error(`No installers matched ${pattern}`);
    return matches;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { GITHUB_REPOSITORY: repo, RELEASE_TAG: tag, RELEASE_SHA: sha, RELEASE_ID: id, GH_TOKEN: token } = process.env;
  const client = releaseClient({ repo, tag, sha, id, token });
  const [, , command, platform] = process.argv;
  if (command === "validate") {
    await client.validate();
  } else if (command === "upload") {
    await client.upload(collectInstallers(platform));
  } else if (command === "publish") {
    await client.publish();
  } else {
    throw new Error(`Unknown installer release command: ${command}`);
  }
}
