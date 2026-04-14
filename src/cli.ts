#!/usr/bin/env bun

import { bold, cyan, dim, green, yellow } from "ansis";
import { program } from "commander";
import pkg from "../package.json";
import { registerAddCommand } from "./commands/add.ts";
import { registerAllowCommand } from "./commands/allow.ts";
import { registerAuthCommand, registerDeauthCommand } from "./commands/auth.ts";
import { registerCheckUpdateCommand } from "./commands/check-update.ts";
import { registerDenyCommand } from "./commands/deny.ts";
import { registerExecCommand } from "./commands/exec.ts";
import { registerIndexCommand } from "./commands/index.ts";
import { registerInfoCommand } from "./commands/info.ts";
import { registerListCommand } from "./commands/list.ts";
import { registerPingCommand } from "./commands/ping.ts";
import { registerPromptCommand } from "./commands/prompt.ts";
import { registerRemoveCommand } from "./commands/remove.ts";
import { registerResourceCommand } from "./commands/resource.ts";
import { registerSearchCommand } from "./commands/search.ts";
import { registerServersCommand } from "./commands/servers.ts";
import { registerSkillCommand } from "./commands/skill.ts";
import { registerTaskCommand } from "./commands/task.ts";
import { registerUpgradeCommand } from "./commands/upgrade.ts";
import { maybeCheckForUpdate } from "./update/background.ts";

program
	.name("mcpx")
	.description("A command-line interface for MCP servers. curl for MCP.")
	.version(pkg.version)
	.option("-c, --config <path>", "config directory path")
	.option("-d, --with-descriptions", "include tool descriptions in output")
	.option("-j, --json", "force JSON output")
	.option("-F, --format <format>", "output format (json, markdown)")
	.option("-v, --verbose", "show HTTP details and JSON-RPC protocol messages")
	.option("-S, --show-secrets", "show full auth tokens in verbose output")
	.option("-N, --no-interactive", "decline server elicitation requests")
	.option(
		"-l, --log-level <level>",
		"minimum server log level (debug|info|notice|warning|error|critical|alert|emergency)",
		"warning",
	);

program.configureHelp({
	styleTitle: (str) => bold(str),
	styleCommandText: (str) => cyan(str),
	styleSubcommandText: (str) => cyan(str),
	styleOptionText: (str) => yellow(str),
	styleArgumentText: (str) => green(str),
	styleDescriptionText: (str) => dim(str),
});

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
registerAllowCommand(program);
registerDenyCommand(program);
registerCheckUpdateCommand(program);
registerUpgradeCommand(program);

// Detect unknown subcommands before commander misreports them as "too many arguments"
const knownCommands = new Set(program.commands.map((c) => c.name()));
const cliArgs = process.argv.slice(2);
let firstCommand: string | undefined;
for (let i = 0; i < cliArgs.length; i++) {
	const a = cliArgs[i]!;
	if (a === "-c" || a === "--config" || a === "-l" || a === "--log-level" || a === "-F" || a === "--format") {
		i++; // skip the option's value argument
		continue;
	}
	if (a.startsWith("-")) continue;
	firstCommand = a;
	break;
}
if (firstCommand && !knownCommands.has(firstCommand)) {
	console.error(`error: unknown command '${firstCommand}'. See 'mcpx --help'.`);
	process.exit(1);
}

// Fire-and-forget background update check
const updateNotice = maybeCheckForUpdate();

program.parse();

// Print update notice after command output completes
process.on("beforeExit", async () => {
	const notice = await updateNotice;
	if (notice) process.stderr.write(notice);
});
