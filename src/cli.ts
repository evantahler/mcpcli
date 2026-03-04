#!/usr/bin/env bun

import { program } from "commander";
import { registerListCommand } from "./commands/list.ts";
import { registerInfoCommand } from "./commands/info.ts";
import { registerSearchCommand } from "./commands/search.ts";
import { registerCallCommand } from "./commands/call.ts";
import { registerAuthCommand, registerDeauthCommand } from "./commands/auth.ts";
import { registerIndexCommand } from "./commands/index.ts";

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
registerCallCommand(program);
registerAuthCommand(program);
registerDeauthCommand(program);
registerIndexCommand(program);

program.parse();
