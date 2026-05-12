import type { Command } from "commander";
import { ServerManager } from "./client/manager.ts";
import { loadConfig } from "./config/loader.ts";
import type { Config } from "./config/schemas.ts";
import { DEFAULTS, ENV } from "./constants.ts";
import { type FormatOptions, type OutputFormat, VALID_FORMATS } from "./output/formatter.ts";
import { logger } from "./output/logger.ts";

export interface AppContext {
	config: Config;
	manager: ServerManager;
	formatOptions: FormatOptions;
	noInteractive: boolean;
}

/** Build the app context from the root commander program options */
export async function getContext(program: Command): Promise<AppContext> {
	const opts = program.opts();

	const config = await loadConfig({
		configFlag: opts.config as string | undefined,
	});

	const verbose = !!(
		(opts.verbose as boolean | undefined) ||
		process.env[ENV.DEBUG] === "1" ||
		process.env[ENV.DEBUG] === "true"
	);
	const showSecrets = !!(opts.showSecrets as boolean | undefined);
	const concurrency = Number(process.env[ENV.CONCURRENCY] ?? DEFAULTS.CONCURRENCY);
	const timeout = Number(process.env[ENV.TIMEOUT] ?? DEFAULTS.TIMEOUT_SECONDS) * 1000;
	const maxRetries = Number(process.env[ENV.MAX_RETRIES] ?? DEFAULTS.MAX_RETRIES);
	const logLevel = (opts.logLevel as string | undefined) ?? DEFAULTS.LOG_LEVEL;

	const json = !!(opts.json as boolean | undefined);
	// Commander's --no-interactive sets opts.interactive = false (default true)
	const noInteractive = opts.interactive === false;

	const formatFlag = opts.format as string | undefined;
	if (formatFlag && !VALID_FORMATS.includes(formatFlag as OutputFormat)) {
		logger.error(`error: Invalid format "${formatFlag}". Use: ${VALID_FORMATS.join(", ")}`);
		process.exit(1);
	}
	const format = formatFlag as OutputFormat | undefined;

	const manager = new ServerManager({
		servers: config.servers,
		configDir: config.configDir,
		auth: config.auth,
		concurrency,
		verbose,
		showSecrets,
		timeout,
		maxRetries,
		logLevel,
		json,
		noInteractive,
	});

	const formatOptions: FormatOptions = {
		json: opts.json as boolean | undefined,
		withDescriptions: opts.withDescriptions as boolean | undefined,
		verbose,
		showSecrets,
		logLevel,
		format,
	};

	logger.configure(formatOptions);

	return { config, manager, formatOptions, noInteractive };
}
