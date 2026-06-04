import { yellow } from "ansis";
import type { Command } from "commander";
import { saveSearchIndex } from "../config/loader.ts";
import { getContext } from "../context.ts";
import { logger } from "../output/logger.ts";
import { maybeReindexDrift } from "../search/auto-reindex.ts";
import { buildSearchIndex } from "../search/indexer.ts";
import { getStaleServers } from "../search/staleness.ts";
import { withCommand } from "./with-command.ts";

/** Run the search index build. Reusable from other commands (e.g. add). */
export async function runIndex(program: Command): Promise<void> {
	await withCommand(
		program,
		{ spinnerText: "Connecting to servers...", errorLabel: "Indexing failed" },
		async ({ config, manager, spinner }) => {
			const start = performance.now();
			const index = await buildSearchIndex(manager, (progress) => {
				spinner.update(`Indexing ${progress.current}/${progress.total}: ${progress.tool}`);
			});
			const elapsed = ((performance.now() - start) / 1000).toFixed(1);

			await saveSearchIndex(config.configDir, index);
			spinner.success(`Indexed ${index.tools.length} tools in ${elapsed}s`);

			logger.info(`Saved to ${config.configDir}/search.json`);
		},
	)();
}

export function registerIndexCommand(program: Command) {
	program
		.command("index")
		.description("build the search index from all configured servers")
		.option("-i, --status", "show index status")
		.action(async (options: { status?: boolean }) => {
			if (options.status) {
				const { config, manager, formatOptions } = await getContext(program);
				try {
					if (config.searchIndex.tools.length === 0) {
						console.log("No search index. Run: mcpx index");
						return;
					}

					// Connect to servers and refresh the index for any whose tools have drifted.
					const spinner = logger.startSpinner("Checking servers for tool changes...", formatOptions);
					const { tools, errors } = await manager.getAllTools();
					const { servers: reindexed } = await maybeReindexDrift(config, tools, errors, (p) => {
						spinner.update(`Re-indexing ${p.current}/${p.total}: ${p.tool}`);
					});
					spinner.stop();

					const idx = config.searchIndex;
					console.log(`Tools:   ${idx.tools.length}`);
					console.log(`Model:   ${idx.embedding_model}`);
					console.log(`Indexed: ${idx.indexed_at}`);

					if (reindexed.length > 0) {
						console.log(`Refreshed: ${reindexed.join(", ")} (tools changed since last index)`);
					}

					const stale = getStaleServers(idx, config.servers);
					if (stale.length > 0) {
						console.log(yellow(`Stale:   ${stale.join(", ")} (run mcpx index to refresh)`));
					}
				} finally {
					await manager.close();
				}
				return;
			}

			await runIndex(program);
		});
}
