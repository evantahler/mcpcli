import type { Command } from "commander";

export function registerAuthCommand(program: Command) {
  program
    .command("auth <server>")
    .description("authenticate with an HTTP MCP server")
    .option("--status", "check auth status and token TTL")
    .option("--refresh", "force token refresh")
    .action((server, _options) => {
      // TODO: auth implementation
      console.log(`mcpcli auth ${server} — not yet implemented`);
    });
}
