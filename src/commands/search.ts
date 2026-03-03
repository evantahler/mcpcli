import type { Command } from "commander";

export function registerSearchCommand(program: Command) {
  program
    .command("search <query>")
    .description("search tools by keyword and/or semantic similarity")
    .option("--keyword", "keyword/glob search only")
    .option("--semantic", "semantic search only")
    .action((query, _options) => {
      // TODO: search implementation
      console.log(`mcpcli search "${query}" — not yet implemented`);
    });
}
