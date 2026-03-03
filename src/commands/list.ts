import type { Command } from "commander";

export function registerListCommand(program: Command) {
  program.action((_options) => {
    // TODO: list all servers and tools
    console.log("mcpcli — list servers and tools (not yet implemented)");
  });
}
