import type { Command } from "commander";

export function registerCallCommand(program: Command) {
  program
    .command("call <server> <tool> [args]")
    .description("validate inputs locally, then execute a tool")
    .action((server, tool, args, _options) => {
      // TODO: call implementation
      console.log(`mcpcli call ${server} ${tool} ${args ?? "(no args)"} — not yet implemented`);
    });
}
