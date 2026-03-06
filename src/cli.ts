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

declare const BUILD_VERSION: string | undefined;

const version = typeof BUILD_VERSION !== "undefined" ? BUILD_VERSION : "0.1.0-dev";

program
  .name("mcpcli")
  .description("A command-line interface for MCP servers. curl for MCP.")
  .version(version)
  .option("-c, --config <path>", "config directory path")
  .option("-d, --with-descriptions", "include tool descriptions in output")
  .option("-j, --json", "force JSON output")
  .option("-v, --verbose", "show HTTP request/response details")
  .option("-S, --show-secrets", "show full auth tokens in verbose output");

registerListCommand(program);
registerInfoCommand(program);
registerSearchCommand(program);
registerExecCommand(program);
registerAuthCommand(program);
registerDeauthCommand(program);
registerIndexCommand(program);
registerAddCommand(program);
registerRemoveCommand(program);

program.parse();
