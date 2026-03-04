import type { Command } from "commander";
import { dim } from "ansis";
import { getContext } from "../context.ts";
import { buildSearchIndex } from "../search/indexer.ts";
import { saveSearchIndex } from "../config/loader.ts";
import { formatError } from "../output/formatter.ts";
import { startSpinner } from "../output/spinner.ts";

export function registerIndexCommand(program: Command) {
  program
    .command("index")
    .description("build the search index from all configured servers")
    .option("-i, --status", "show index status")
    .action(async (options: { status?: boolean }) => {
      const { config, manager, formatOptions } = await getContext(program);

      if (options.status) {
        const idx = config.searchIndex;
        if (idx.tools.length === 0) {
          console.log("No search index. Run: mcpcli index");
        } else {
          console.log(`Tools:   ${idx.tools.length}`);
          console.log(`Model:   ${idx.embedding_model}`);
          console.log(`Indexed: ${idx.indexed_at}`);
        }
        await manager.close();
        return;
      }

      const spinner = startSpinner("Connecting to servers...", formatOptions);

      try {
        const start = performance.now();
        const index = await buildSearchIndex(manager, (progress) => {
          spinner.update(`Indexing ${progress.current}/${progress.total}: ${progress.tool}`);
        });
        const elapsed = ((performance.now() - start) / 1000).toFixed(1);

        await saveSearchIndex(config.configDir, index);
        spinner.success(`Indexed ${index.tools.length} tools in ${elapsed}s`);

        if (process.stderr.isTTY) {
          process.stderr.write(dim(`Saved to ${config.configDir}/search.json\n`));
        }
      } catch (err) {
        spinner.error("Indexing failed");
        console.error(formatError(String(err), formatOptions));
        process.exit(1);
      } finally {
        await manager.close();
      }
    });
}
