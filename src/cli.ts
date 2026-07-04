#!/usr/bin/env bun

// MUST be first: translates --no-color / --json / --force-color argv flags into
// NO_COLOR / FORCE_COLOR env vars before any ansis-using module loads. ansis
// decides its color level at module load and cannot be reconfigured afterwards.
import "./output/early-env.ts";

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
import { logger } from "./output/logger.ts";
import { theme } from "./output/theme.ts";
import { detectMode, setMode } from "./output/tty.ts";
import { ExitError, installSignalHandlers } from "./shutdown.ts";
import { updater } from "./update/updater.ts";

installSignalHandlers();

// Resolve output mode (TTY/color/json/verbose) from env + raw argv before
// commander parses anything, so the help screen and any early prints honor
// --no-color / --json / NO_COLOR / FORCE_COLOR. The mode is frozen via setMode
// and propagated to ansis.level so direct ansis calls also respect it.
const rawArgv = process.argv.slice(2);
setMode(
	detectMode({
		json: rawArgv.includes("--json") || rawArgv.includes("-j"),
		verbose: rawArgv.includes("--verbose") || rawArgv.includes("-v"),
		noColor: rawArgv.includes("--no-color"),
		forceColor: rawArgv.includes("--force-color"),
	}),
);

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
	.option("--no-color", "disable ANSI color output (also honored via NO_COLOR=1)")
	.option("--force-color", "force ANSI color output even when piped (also honored via FORCE_COLOR=1)")
	.option(
		"-l, --log-level <level>",
		"minimum server log level (debug|info|notice|warning|error|critical|alert|emergency)",
		"warning",
	);

program.configureHelp({
	styleTitle: (str) => theme.tool(str),
	styleCommandText: (str) => theme.path(str),
	styleSubcommandText: (str) => theme.path(str),
	styleOptionText: (str) => theme.warn(str),
	styleArgumentText: (str) => theme.param(str),
	styleDescriptionText: (str) => theme.muted(str),
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
	logger.error(`error: unknown command '${firstCommand}'. See 'mcpx --help'.`);
	process.exit(1);
}

// Fire-and-forget background update check
const updateNotice = updater.maybeBackgroundNotice();

try {
	await program.parseAsync();
} catch (err) {
	if (err instanceof ExitError) {
		process.exit(err.code);
	}
	logger.error(String(err));
	process.exit(1);
}

// Print update notice after command output completes
process.on("beforeExit", async () => {
	const notice = await updateNotice;
	if (notice) logger.writeRaw(notice);
});
