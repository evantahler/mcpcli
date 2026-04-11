import { $ } from "bun";
import { green, yellow, red, cyan, dim } from "ansis";
import type { Command } from "commander";
import { createSpinner } from "nanospinner";
import { tmpdir } from "os";
import { join } from "path";
import pkg from "../../package.json";
import {
  checkForUpdate,
  detectInstallMethod,
  needsCheck,
  type InstallMethod,
} from "../update/checker.ts";
import { loadUpdateCache, saveUpdateCache, clearUpdateCache } from "../update/cache.ts";
import type { UpdateCache } from "../update/checker.ts";
import pkgMeta from "../../package.json";

const GITHUB_REPO = pkgMeta.repository.url
  .replace(/^https:\/\/github\.com\//, "")
  .replace(/\.git$/, "");

// TODO: Add Windows support (https://github.com/evantahler/mcpx/issues)
function platformArtifactName(): string {
  const os = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `mcpx-${os}-${arch}`;
}

async function upgradeWithPackageManager(command: string, args: string[]): Promise<boolean> {
  const result = await $`${command} ${args}`.nothrow();
  return result.exitCode === 0;
}

async function upgradeFromBinary(latestVersion: string): Promise<boolean> {
  const artifact = platformArtifactName();
  const tag = `v${latestVersion}`;
  const url = `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${artifact}`;

  const tmpPath = join(tmpdir(), `mcpx-upgrade-${Date.now()}`);
  const targetPath = process.execPath;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(red(`Failed to download binary: HTTP ${res.status}`));
      return false;
    }

    const bytes = await res.arrayBuffer();
    await Bun.write(tmpPath, bytes);

    await $`chmod +x ${tmpPath}`.quiet();

    // Try to move into place
    const mv = await $`mv ${tmpPath} ${targetPath}`.quiet().nothrow();

    if (mv.exitCode !== 0) {
      // Try with sudo
      console.log(dim("Requires elevated permissions..."));
      const sudo = await $`sudo mv ${tmpPath} ${targetPath}`.nothrow();
      if (sudo.exitCode !== 0) {
        console.error(red("Failed to install binary. Try running with sudo."));
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error(red(`Failed to upgrade binary: ${err}`));
    // Clean up temp file
    await $`rm -f ${tmpPath}`.quiet().nothrow();
    return false;
  }
}

export function registerUpgradeCommand(program: Command) {
  program
    .command("upgrade")
    .description("Upgrade mcpx to the latest version")
    .action(async () => {
      const opts = program.opts();
      const json = !!(opts.json as boolean | undefined);
      const isTTY = process.stderr.isTTY ?? false;

      const spinner =
        !json && isTTY
          ? createSpinner("Checking for updates...", { stream: process.stderr }).start()
          : null;

      try {
        // Check for update (use cache if fresh)
        const cache = await loadUpdateCache();
        let latestVersion: string;
        let hasUpdate: boolean;

        if (!needsCheck(cache) && cache) {
          latestVersion = cache.latestVersion;
          hasUpdate = cache.hasUpdate;
        } else {
          const info = await checkForUpdate(pkg.version);
          latestVersion = info.latestVersion;
          hasUpdate = info.hasUpdate;

          const newCache: UpdateCache = {
            lastCheckAt: new Date().toISOString(),
            latestVersion,
            hasUpdate,
            changelog: info.changelog,
          };
          await saveUpdateCache(newCache);
        }

        if (!hasUpdate) {
          spinner?.stop();
          if (json) {
            console.log(
              JSON.stringify({
                upgraded: false,
                currentVersion: pkg.version,
                message: "Already up to date",
              }),
            );
          } else {
            console.log(green(`mcpx is already up to date (v${pkg.version})`));
          }
          return;
        }

        const method: InstallMethod = detectInstallMethod();
        spinner?.update({
          text: `Upgrading from v${pkg.version} to v${latestVersion} (${method})...`,
        });

        let success = false;

        switch (method) {
          case "bun":
            spinner?.stop();
            success = await upgradeWithPackageManager("bun", [
              "install",
              "-g",
              `@evantahler/mcpx@${latestVersion}`,
            ]);
            break;

          case "npm":
            spinner?.stop();
            success = await upgradeWithPackageManager("npm", [
              "install",
              "-g",
              `@evantahler/mcpx@${latestVersion}`,
            ]);
            break;

          case "binary":
            spinner?.stop();
            success = await upgradeFromBinary(latestVersion);
            break;

          case "local-dev":
            spinner?.stop();
            if (json) {
              console.log(
                JSON.stringify({
                  upgraded: false,
                  currentVersion: pkg.version,
                  latestVersion,
                  installMethod: "local-dev",
                  message: "Running from source. Use `git pull && bun install` to update.",
                }),
              );
            } else {
              console.log(yellow("Running from source. Use `git pull && bun install` to update."));
            }
            return;
        }

        if (success) {
          await clearUpdateCache();
          if (json) {
            console.log(
              JSON.stringify({
                upgraded: true,
                previousVersion: pkg.version,
                newVersion: latestVersion,
                installMethod: method,
              }),
            );
          } else {
            console.log(green(`Successfully upgraded mcpx: v${pkg.version} → v${latestVersion}`));
          }
        } else {
          if (json) {
            console.log(
              JSON.stringify({
                upgraded: false,
                currentVersion: pkg.version,
                latestVersion,
                installMethod: method,
                message: "Upgrade failed",
              }),
            );
          } else {
            console.error(red("Upgrade failed. See errors above."));
          }
          process.exit(1);
        }
      } catch (err) {
        spinner?.error({ text: "Upgrade failed" });
        console.error(String(err));
        process.exit(1);
      }
    });
}
