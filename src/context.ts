import type { Command } from "commander";
import { loadConfig, type LoadConfigOptions } from "./config/loader.ts";
import { ServerManager } from "./client/manager.ts";
import type { Config } from "./config/schemas.ts";
import type { FormatOptions } from "./output/formatter.ts";

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

  const verbose = !!(opts.verbose as boolean | undefined);
  const showSecrets = !!(opts.showSecrets as boolean | undefined);
  const concurrency = Number(process.env.MCP_CONCURRENCY ?? 5);
  const manager = new ServerManager(
    config.servers,
    config.configDir,
    config.auth,
    concurrency,
    verbose,
    showSecrets,
  );

  const formatOptions: FormatOptions = {
    json: opts.json as boolean | undefined,
    withDescriptions: opts.withDescriptions as boolean | undefined,
    verbose,
    showSecrets,
  };

  return { config, manager, formatOptions };
}
