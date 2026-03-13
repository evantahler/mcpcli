import type { Command } from "commander";
import { yellow } from "ansis";
import { getContext } from "../context.ts";
import { buildSearchIndex } from "../search/indexer.ts";
import { getStaleServers } from "../search/staleness.ts";
import { saveSearchIndex } from "../config/loader.ts";
import { formatError } from "../output/formatter.ts";
import { logger } from "../output/logger.ts";

/** Run the search index build. Reusable from other commands (e.g. add). */
export async function runIndex(program: Command): Promise<void> {
  const { config, manager, formatOptions } = await getContext(program);
  const spinner = logger.startSpinner("Connecting to servers...", formatOptions);

  try {
    const start = performance.now();
    const index = await buildSearchIndex(manager, (progress) => {
      spinner.update(`Indexing ${progress.current}/${progress.total}: ${progress.tool}`);
    });
    const elapsed = ((performance.now() - start) / 1000).toFixed(1);

    await saveSearchIndex(config.configDir, index);
    spinner.success(`Indexed ${index.tools.length} tools in ${elapsed}s`);

    logger.info(`Saved to ${config.configDir}/search.json`);
  } catch (err) {
    spinner.error("Indexing failed");
    console.error(formatError(String(err), formatOptions));
    process.exit(1);
  } finally {
    await manager.close();
  }
}

export function registerIndexCommand(program: Command) {
  program
    .command("index")
    .description("build the search index from all configured servers")
    .option("-i, --status", "show index status")
    .action(async (options: { status?: boolean }) => {
      if (options.status) {
        const { config, manager } = await getContext(program);
        const idx = config.searchIndex;
        if (idx.tools.length === 0) {
          console.log("No search index. Run: mcpx index");
        } else {
          console.log(`Tools:   ${idx.tools.length}`);
          console.log(`Model:   ${idx.embedding_model}`);
          console.log(`Indexed: ${idx.indexed_at}`);

          const stale = getStaleServers(idx, config.servers);
          if (stale.length > 0) {
            console.log(yellow(`Stale:   ${stale.join(", ")} (run mcpx index to refresh)`));
          }
        }
        await manager.close();
        return;
      }

      await runIndex(program);
    });
}
