import type { Command } from "commander";
import { yellow } from "ansis";
import { getContext } from "../context.ts";
import { search } from "../search/index.ts";
import { getStaleServers } from "../search/staleness.ts";
import { formatError, formatSearchResults } from "../output/formatter.ts";
import { startSpinner } from "../output/spinner.ts";

export function registerSearchCommand(program: Command) {
  program
    .command("search <terms...>")
    .description("search tools by keyword and/or semantic similarity")
    .option("-k, --keyword", "keyword/glob search only")
    .option("-q, --query", "semantic search only")
    .action(async (terms: string[], options: { keyword?: boolean; query?: boolean }) => {
      const query = terms.join(" ");
      const { config, formatOptions } = await getContext(program);

      if (config.searchIndex.tools.length === 0) {
        console.error(formatError("No search index found. Run: mcpcli index", formatOptions));
        process.exit(1);
      }

      const stale = getStaleServers(config.searchIndex, config.servers);
      if (stale.length > 0) {
        process.stderr.write(
          yellow(
            `Warning: index has tools for removed servers: ${stale.join(", ")}. Run: mcpcli index\n`,
          ),
        );
      }

      const spinner = startSpinner("Searching...", formatOptions);

      try {
        const results = await search(query, config.searchIndex, {
          keywordOnly: options.keyword,
          semanticOnly: options.query,
        });
        spinner.stop();
        console.log(formatSearchResults(results, formatOptions));
      } catch (err) {
        spinner.stop();
        console.error(formatError(String(err), formatOptions));
        process.exit(1);
      }
    });
}
