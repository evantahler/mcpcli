import { yellow, cyan, dim } from "ansis";
import pkg from "../../package.json";
import { ENV, DEFAULTS } from "../constants.ts";
import { checkForUpdate, needsCheck, type UpdateCache } from "./checker.ts";
import { loadUpdateCache, saveUpdateCache } from "./cache.ts";

/** Format an update notice for stderr output. */
function formatNotice(currentVersion: string, latestVersion: string, changelog?: string): string {
  const lines: string[] = ["", yellow(`Update available: ${currentVersion} → ${latestVersion}`)];

  if (changelog) {
    lines.push("");
    lines.push(dim(changelog));
  }

  lines.push("");
  lines.push(cyan(`Run \`mcpx upgrade\` to update`));
  lines.push("");

  return lines.join("\n");
}

/**
 * Non-blocking background update check. Returns a formatted notice string
 * if an update is available, or null otherwise. Never throws.
 */
export async function maybeCheckForUpdate(): Promise<string | null> {
  try {
    // Opt-out via env var
    if (process.env[ENV.NO_UPDATE_CHECK] === "1") return null;

    // Skip if this is the check-update or upgrade command
    const args = process.argv.slice(2);
    const command = args.find((a) => !a.startsWith("-"));
    if (command === "check-update" || command === "upgrade") return null;

    // Only show in TTY
    if (!(process.stderr.isTTY ?? false)) return null;

    const cache = await loadUpdateCache();

    if (!needsCheck(cache)) {
      // Cache is fresh — use cached result
      if (cache?.hasUpdate) {
        return formatNotice(pkg.version, cache.latestVersion, cache.changelog);
      }
      return null;
    }

    // Cache is stale or missing — check with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULTS.UPDATE_CHECK_TIMEOUT_MS);

    try {
      const info = await checkForUpdate(pkg.version, controller.signal);

      const newCache: UpdateCache = {
        lastCheckAt: new Date().toISOString(),
        latestVersion: info.latestVersion,
        hasUpdate: info.hasUpdate,
        changelog: info.changelog,
      };
      await saveUpdateCache(newCache);

      if (info.hasUpdate) {
        return formatNotice(pkg.version, info.latestVersion, info.changelog);
      }
    } finally {
      clearTimeout(timeout);
    }

    return null;
  } catch {
    return null;
  }
}
