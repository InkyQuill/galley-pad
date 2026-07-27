import { expect, it, vi } from "vitest";
import { checkForGitHubUpdate } from "./githubRelease";

function response(body: unknown, ok = true): Response {
  return { ok, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

it("returns a newer stable GitHub release", async () => {
  const fetchImpl = vi.fn().mockResolvedValue(
    response({
      draft: false,
      prerelease: false,
      tag_name: "v1.5.1",
      html_url: "https://github.com/InkyQuill/galley-pad/releases/tag/v1.5.1",
    }),
  );

  await expect(checkForGitHubUpdate("1.5.0", fetchImpl)).resolves.toEqual({
    version: "1.5.1",
    releaseUrl: "https://github.com/InkyQuill/galley-pad/releases/tag/v1.5.1",
  });
  expect(fetchImpl).toHaveBeenCalledWith(
    "https://api.github.com/repos/InkyQuill/galley-pad/releases/latest",
    { headers: { Accept: "application/vnd.github+json" } },
  );
});

it.each([
  ["an equal version", "v1.5.0"],
  ["an older version", "v1.4.0"],
  ["a prerelease", "v1.6.0-beta.1"],
  ["an invalid tag", "newest"],
  ["an equals-prefixed v tag", "=v1.6.0"],
  ["a whitespace-padded tag", "  v1.6.0  "],
  ["an equals sign after v", "v=1.6.0"],
])("returns null for %s", async (_description, tag_name) => {
  const fetchImpl = vi.fn().mockResolvedValue(
    response({
      draft: false,
      prerelease: false,
      tag_name,
      html_url: `https://github.com/InkyQuill/galley-pad/releases/tag/${tag_name}`,
    }),
  );

  await expect(checkForGitHubUpdate("1.5.0", fetchImpl)).resolves.toBeNull();
});

it("returns null for a draft release", async () => {
  const fetchImpl = vi.fn().mockResolvedValue(
    response({
      draft: true,
      prerelease: false,
      tag_name: "v1.6.0",
      html_url: "https://github.com/InkyQuill/galley-pad/releases/tag/v1.6.0",
    }),
  );

  await expect(checkForGitHubUpdate("1.5.0", fetchImpl)).resolves.toBeNull();
});

it("returns null for a release URL outside GitHub", async () => {
  const fetchImpl = vi.fn().mockResolvedValue(
    response({
      draft: false,
      prerelease: false,
      tag_name: "v1.6.0",
      html_url: "https://example.com/releases/tag/v1.6.0",
    }),
  );

  await expect(checkForGitHubUpdate("1.5.0", fetchImpl)).resolves.toBeNull();
});

it("returns null when the release URL tag differs from the response tag", async () => {
  const fetchImpl = vi.fn().mockResolvedValue(
    response({
      draft: false,
      prerelease: false,
      tag_name: "v1.6.0",
      html_url: "https://github.com/InkyQuill/galley-pad/releases/tag/v1.6.1",
    }),
  );

  await expect(checkForGitHubUpdate("1.5.0", fetchImpl)).resolves.toBeNull();
});

it("returns null for a non-OK response", async () => {
  const fetchImpl = vi.fn().mockResolvedValue(response({}, false));

  await expect(checkForGitHubUpdate("1.5.0", fetchImpl)).resolves.toBeNull();
});

it("returns null when the release fetch rejects", async () => {
  const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));

  await expect(checkForGitHubUpdate("1.5.0", fetchImpl)).resolves.toBeNull();
});

it("returns null when release JSON parsing rejects", async () => {
  const fetchImpl = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockRejectedValue(new Error("invalid JSON")),
  } as unknown as Response);

  await expect(checkForGitHubUpdate("1.5.0", fetchImpl)).resolves.toBeNull();
});
