import { exec } from "child_process";

/**
 * Open a URL in the default browser (macOS/Windows/Linux).
 * Falls back to printing the URL to stderr if no browser is available
 * (e.g., headless servers, Docker containers).
 */
export function openBrowser(url: string): Promise<void> {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "${url}"`
        : `xdg-open "${url}"`;

  return new Promise((resolve) => {
    exec(cmd, (err) => {
      if (err) {
        process.stderr.write(`Could not open browser. Please visit:\n  ${url}\n`);
      }
      resolve();
    });
  });
}
