import { green, yellow, cyan, dim } from "ansis";
import type { Command } from "commander";
import { createSpinner } from "nanospinner";
import pkg from "../../package.json";
import { checkForUpdate } from "../update/checker.ts";
import { saveUpdateCache } from "../update/cache.ts";
import type { UpdateCache } from "../update/checker.ts";

export function registerCheckUpdateCommand(program: Command) {
  program
    .command("check-update")
    .description("Check for a newer version of mcpx")
    .action(async () => {
      const opts = program.opts();
      const json = !!(opts.json as boolean | undefined);
      const isTTY = process.stderr.isTTY ?? false;

      const spinner =
        !json && isTTY
          ? createSpinner("Checking for updates...", { stream: process.stderr }).start()
          : null;

      try {
        const info = await checkForUpdate(pkg.version);

        // Save to cache
        const cache: UpdateCache = {
          lastCheckAt: new Date().toISOString(),
          latestVersion: info.latestVersion,
          hasUpdate: info.hasUpdate,
          changelog: info.changelog,
        };
        await saveUpdateCache(cache);

        spinner?.stop();

        if (json) {
          console.log(JSON.stringify(info, null, 2));
          return;
        }

        if (!info.hasUpdate) {
          console.log(green(`mcpx is up to date (v${info.currentVersion})`));
          return;
        }

        console.log(yellow(`Update available: ${info.currentVersion} → ${info.latestVersion}`));

        if (info.changelog) {
          console.log("");
          console.log(dim(info.changelog));
        }

        console.log("");
        console.log(cyan(`Run \`mcpx upgrade\` to update`));
      } catch (err) {
        spinner?.error({ text: "Failed to check for updates" });
        console.error(String(err));
        process.exit(1);
      }
    });
}
