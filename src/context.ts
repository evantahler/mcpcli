import type { Command } from "commander";
import { loadConfig, type LoadConfigOptions } from "./config/loader.ts";
import { ServerManager } from "./client/manager.ts";
import type { Config } from "./config/schemas.ts";
import type { FormatOptions } from "./output/formatter.ts";
import { logger } from "./output/logger.ts";

export interface AppContext {
  config: Config;
  manager: ServerManager;
  formatOptions: FormatOptions;
}

/** Build the app context from the root commander program options */
export async function getContext(program: Command): Promise<AppContext> {
  const opts = program.opts();

  const config = await loadConfig({
    configFlag: opts.config as string | undefined,
  });

  const verbose = !!(
    (opts.verbose as boolean | undefined) ||
    process.env.MCP_DEBUG === "1" ||
    process.env.MCP_DEBUG === "true"
  );
  const showSecrets = !!(opts.showSecrets as boolean | undefined);
  const concurrency = Number(process.env.MCP_CONCURRENCY ?? 5);
  const timeout = Number(process.env.MCP_TIMEOUT ?? 1800) * 1000;
  const maxRetries = Number(process.env.MCP_MAX_RETRIES ?? 3);

  const manager = new ServerManager({
    servers: config.servers,
    configDir: config.configDir,
    auth: config.auth,
    concurrency,
    verbose,
    showSecrets,
    timeout,
    maxRetries,
  });

  const formatOptions: FormatOptions = {
    json: opts.json as boolean | undefined,
    withDescriptions: opts.withDescriptions as boolean | undefined,
    verbose,
    showSecrets,
  };

  logger.configure(formatOptions);

  return { config, manager, formatOptions };
}
