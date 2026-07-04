import { createUpdater } from "upgradr";
import pkg from "../../package.json";
import { DEFAULT_CONFIG_DIR, DEFAULTS, ENV } from "../constants.ts";

// Derived from package.json so there's a single source of truth: the GitHub
// "owner/name" from the repository URL, and the CLI/binary name from the `bin` key.
const GITHUB_REPO = pkg.repository.url.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
const BINARY_NAME = Object.keys(pkg.bin)[0]!;

/**
 * Shared self-updater for the mcpx CLI, backed by the `upgradr` package.
 *
 * The default asset name (`mcpx-<os>-<arch>[.exe]`) matches the binaries
 * published by the auto-release workflow, and the cache lives at
 * `~/.mcpx/update.json` — the same location the previous home-rolled tooling
 * used, so existing caches remain valid.
 */
export const updater = createUpdater({
	currentVersion: pkg.version,
	packageName: pkg.name,
	repo: GITHUB_REPO,
	binaryName: BINARY_NAME,
	cacheDir: DEFAULT_CONFIG_DIR,
	cliName: BINARY_NAME,
	noUpdateCheckEnv: ENV.NO_UPDATE_CHECK,
	checkIntervalMs: DEFAULTS.UPDATE_CHECK_INTERVAL_MS,
	timeoutMs: DEFAULTS.UPDATE_CHECK_TIMEOUT_MS,
});
