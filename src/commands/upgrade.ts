import { green, red, yellow } from "ansis";
import type { Command } from "commander";
import { createSpinner } from "nanospinner";
import { updater } from "../update/updater.ts";

export function registerUpgradeCommand(program: Command) {
	program
		.command("upgrade")
		.description("Upgrade mcpx to the latest version")
		.action(async () => {
			const opts = program.opts();
			const json = !!(opts.json as boolean | undefined);
			const isTTY = process.stderr.isTTY ?? false;

			const spinner =
				!json && isTTY ? createSpinner("Checking for updates...", { stream: process.stderr }).start() : null;

			try {
				// upgradr performs a fresh check, detects the install method, upgrades
				// in place (npm/bun/binary), and manages the cache — all in one call.
				const result = await updater.upgrade();
				spinner?.stop();

				if (json) {
					console.log(JSON.stringify(result, null, 2));
				} else if (!result.hasUpdate) {
					console.log(green(`mcpx is already up to date (v${result.from})`));
				} else if (result.method === "local-dev") {
					console.log(yellow("Running from source. Use `git pull && bun install` to update."));
				} else if (result.success) {
					console.log(green(`Successfully upgraded mcpx: v${result.from} → v${result.to}`));
				} else {
					console.error(red(`Upgrade failed${result.error ? `: ${result.error}` : "."}`));
				}

				// Only a genuinely attempted-and-failed install is an error exit;
				// local-dev is informational and exits 0.
				if (result.performed && !result.success) process.exit(1);
			} catch (err) {
				spinner?.error({ text: "Upgrade failed" });
				console.error(String(err));
				process.exit(1);
			}
		});
}
