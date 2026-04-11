import pkg from "../../package.json";
import { DEFAULTS } from "../constants.ts";

const NPM_REGISTRY_URL = `https://registry.npmjs.org/${pkg.name}/latest`;
const GITHUB_REPO = pkg.repository.url
  .replace(/^https:\/\/github\.com\//, "")
  .replace(/\.git$/, "");

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  aheadOfLatest: boolean;
  changelog?: string;
}

export interface UpdateCache {
  lastCheckAt: string;
  latestVersion: string;
  hasUpdate: boolean;
  changelog?: string;
}

export type InstallMethod = "npm" | "bun" | "binary" | "local-dev";

/** Compare two semver strings. Returns true if latest > current. */
export function isNewerVersion(current: string, latest: string): boolean {
  return Bun.semver.order(current, latest) === -1;
}

/** Fetch the latest version from the npm registry. */
export async function fetchLatestVersion(signal?: AbortSignal): Promise<string> {
  try {
    const res = await fetch(NPM_REGISTRY_URL, { signal });
    if (!res.ok) return pkg.version;
    const data = (await res.json()) as { version: string };
    return data.version;
  } catch {
    return pkg.version;
  }
}

/** Fetch changelog from GitHub releases between two versions. */
export async function fetchChangelog(
  fromVersion: string,
  toVersion: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`, {
      signal,
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!res.ok) return undefined;

    const releases = (await res.json()) as Array<{
      tag_name: string;
      body: string | null;
    }>;

    const relevant = releases.filter((r) => {
      const v = r.tag_name.replace(/^v/, "");
      return isNewerVersion(fromVersion, v) && !isNewerVersion(toVersion, v);
    });

    if (relevant.length === 0) return undefined;

    return relevant
      .map((r) => `## ${r.tag_name}\n${r.body ?? ""}`)
      .join("\n\n")
      .trim();
  } catch {
    return undefined;
  }
}

/** Check npm for a newer version and fetch changelog if available. */
export async function checkForUpdate(
  currentVersion: string,
  signal?: AbortSignal,
): Promise<UpdateInfo> {
  const latestVersion = await fetchLatestVersion(signal);
  const hasUpdate = isNewerVersion(currentVersion, latestVersion);
  const aheadOfLatest = isNewerVersion(latestVersion, currentVersion);

  let changelog: string | undefined;
  if (hasUpdate) {
    changelog = await fetchChangelog(currentVersion, latestVersion, signal);
  }

  return { currentVersion, latestVersion, hasUpdate, aheadOfLatest, changelog };
}

/** Returns true if the cache is missing or older than 24 hours. */
export function needsCheck(cache?: UpdateCache): boolean {
  if (!cache?.lastCheckAt) return true;
  return Date.now() - new Date(cache.lastCheckAt).getTime() > DEFAULTS.UPDATE_CHECK_INTERVAL_MS;
}

/** Detect how mcpx was installed. */
export function detectInstallMethod(): InstallMethod {
  const script = process.argv[1] ?? "";
  const execPath = process.execPath;

  // Local dev: running src/cli.ts directly outside node_modules
  if (script.includes("src/cli.ts") && !script.includes("node_modules")) {
    return "local-dev";
  }

  // Compiled binary: execPath is the binary itself (not bun/node)
  if (!execPath.includes("bun") && !execPath.includes("node")) {
    return "binary";
  }

  // Bun global install: path contains .bun/install
  if (script.includes(".bun/install") || script.includes(".bun/bin")) {
    return "bun";
  }

  // npm global install: fallback for node_modules paths
  return "npm";
}
