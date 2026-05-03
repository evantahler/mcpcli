import { execFile } from "node:child_process";
import { logger } from "../output/logger.ts";

/**
 * Open a URL in the default browser (macOS/Windows/Linux).
 * Falls back to printing the URL to stderr if no browser is available
 * (e.g., headless servers, Docker containers).
 *
 * Uses execFile (not exec) to avoid shell injection via malicious URLs.
 */
export function openBrowser(url: string): Promise<void> {
	// Validate URL scheme to prevent non-HTTP protocols
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			logger.error(`Refusing to open non-HTTP URL: ${url}`);
			return Promise.resolve();
		}
	} catch {
		logger.error(`Invalid URL: ${url}`);
		return Promise.resolve();
	}

	let cmd: string;
	let args: string[];

	if (process.platform === "darwin") {
		cmd = "open";
		args = [url];
	} else if (process.platform === "win32") {
		cmd = "cmd";
		args = ["/c", "start", "", url];
	} else {
		cmd = "xdg-open";
		args = [url];
	}

	return new Promise((resolve) => {
		execFile(cmd, args, (err) => {
			if (err) {
				logger.warn(`Could not open browser. Please visit:\n  ${url}`);
			}
			resolve();
		});
	});
}
