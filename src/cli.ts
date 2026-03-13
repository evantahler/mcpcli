#!/usr/bin/env bun

import { program } from "commander";
import { registerListCommand } from "./commands/list.ts";
import { registerInfoCommand } from "./commands/info.ts";
import { registerSearchCommand } from "./commands/search.ts";
import { registerExecCommand } from "./commands/exec.ts";
import { registerAuthCommand, registerDeauthCommand } from "./commands/auth.ts";
import { registerIndexCommand } from "./commands/index.ts";
import { registerAddCommand } from "./commands/add.ts";
import { registerRemoveCommand } from "./commands/remove.ts";
import { registerSkillCommand } from "./commands/skill.ts";
import { registerPingCommand } from "./commands/ping.ts";
import { registerResourceCommand } from "./commands/resource.ts";
import { registerPromptCommand } from "./commands/prompt.ts";
import { registerServersCommand } from "./commands/servers.ts";
import { registerTaskCommand } from "./commands/task.ts";

import pkg from "../package.json";

program
  .name("mcpcli")
  .description("A command-line interface for MCP servers. curl for MCP.")
  .version(pkg.version)
  .option("-c, --config <path>", "config directory path")
  .option("-d, --with-descriptions", "include tool descriptions in output")
  .option("-j, --json", "force JSON output")
  .option("-v, --verbose", "show HTTP details and JSON-RPC protocol messages")
  .option("-S, --show-secrets", "show full auth tokens in verbose output")
  .option(
    "-l, --log-level <level>",
    "minimum server log level (debug|info|notice|warning|error|critical|alert|emergency)",
    "warning",
  );

registerListCommand(program);
registerInfoCommand(program);
registerSearchCommand(program);
registerExecCommand(program);
registerAuthCommand(program);
registerDeauthCommand(program);
registerIndexCommand(program);
registerAddCommand(program);
registerRemoveCommand(program);
registerSkillCommand(program);
registerPingCommand(program);
registerResourceCommand(program);
registerPromptCommand(program);
registerServersCommand(program);
registerTaskCommand(program);

// Detect unknown subcommands before commander misreports them as "too many arguments"
const knownCommands = new Set(program.commands.map((c) => c.name()));
const cliArgs = process.argv.slice(2);
let firstCommand: string | undefined;
for (let i = 0; i < cliArgs.length; i++) {
  const a = cliArgs[i];
  if (a === "-c" || a === "--config" || a === "-l" || a === "--log-level") {
    i++; // skip the option's value argument
    continue;
  }
  if (a.startsWith("-")) continue;
  firstCommand = a;
  break;
}
if (firstCommand && !knownCommands.has(firstCommand)) {
  console.error(`error: unknown command '${firstCommand}'. See 'mcpcli --help'.`);
  process.exit(1);
}

program.parse();
