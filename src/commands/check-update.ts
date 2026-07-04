import { cyan, dim, green, yellow } from "ansis";
import type { Command } from "commander";
import { createSpinner } from "nanospinner";
import { updater } from "../update/updater.ts";

export function registerCheckUpdateCommand(program: Command) {
	program
		.command("check-update")
		.description("Check for a newer version of mcpx")
		.action(async () => {
			const opts = program.opts();
			const json = !!(opts.json as boolean | undefined);
			const isTTY = process.stderr.isTTY ?? false;

			const spinner =
				!json && isTTY ? createSpinner("Checking for updates...", { stream: process.stderr }).start() : null;

			try {
				const info = await updater.checkForUpdate();

				// Persist the result so the background notice can reuse it.
				await updater.saveCache({
					lastCheckAt: new Date().toISOString(),
					latestVersion: info.latestVersion,
					hasUpdate: info.hasUpdate,
					changelog: info.changelog,
				});

				spinner?.stop();

				if (json) {
					console.log(JSON.stringify(info, null, 2));
					return;
				}

				if (!info.hasUpdate) {
					if (info.aheadOfLatest) {
						console.log(
							yellow(`mcpx v${info.currentVersion} is ahead of latest published release (v${info.latestVersion})`),
						);
					} else {
						console.log(green(`mcpx is up to date (v${info.currentVersion})`));
					}
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
