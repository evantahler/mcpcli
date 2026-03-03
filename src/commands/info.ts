import type { Command } from "commander";

export function registerInfoCommand(program: Command) {
  program
    .command("info <target>")
    .description("show tools for a server, or schema for a specific tool")
    .action((target, _options) => {
      // TODO: info <server> or info <server>/<tool>
      console.log(`mcpcli info ${target} — not yet implemented`);
    });
}
