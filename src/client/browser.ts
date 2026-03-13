import { exec } from "child_process";

/** Open a URL in the default browser (macOS/Windows/Linux) */
export function openBrowser(url: string): Promise<void> {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "${url}"`
        : `xdg-open "${url}"`;

  return new Promise((resolve, reject) => {
    exec(cmd, (err) => (err ? reject(err) : resolve()));
  });
}
