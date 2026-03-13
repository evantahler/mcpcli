import type { Command } from "commander";
import { getContext } from "../context.ts";
import { search } from "../search/index.ts";
import { getStaleServers } from "../search/staleness.ts";
import { formatError, formatSearchResults } from "../output/formatter.ts";
import { logger } from "../output/logger.ts";

export function registerSearchCommand(program: Command) {
  program
    .command("search <terms...>")
    .description("search tools by keyword and/or semantic similarity")
    .option("-k, --keyword", "keyword/glob search only")
    .option("-q, --query", "semantic search only")
    .option("-n, --limit <number>", "max results to return", "10")
    .action(
      async (terms: string[], options: { keyword?: boolean; query?: boolean; limit: string }) => {
        const query = terms.join(" ");
        const { config, formatOptions } = await getContext(program);

        if (config.searchIndex.tools.length === 0) {
          console.error(formatError("No search index found. Run: mcpx index", formatOptions));
          process.exit(1);
        }

        const stale = getStaleServers(config.searchIndex, config.servers);
        if (stale.length > 0) {
          logger.warn(
            `Warning: index has tools for removed servers: ${stale.join(", ")}. Run: mcpx index`,
          );
        }

        const spinner = logger.startSpinner("Searching...", formatOptions);

        try {
          const results = await search(query, config.searchIndex, {
            keywordOnly: options.keyword,
            semanticOnly: options.query,
            topK: parseInt(options.limit, 10),
          });
          spinner.stop();
          console.log(formatSearchResults(results, formatOptions));
        } catch (err) {
          spinner.stop();
          console.error(formatError(String(err), formatOptions));
          process.exit(1);
        }
      },
    );
}
