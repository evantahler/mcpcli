import type { Command } from "commander";
import { type AppContext, getContext } from "../context.ts";
import { formatError } from "../output/formatter.ts";
import { logger, type Spinner } from "../output/logger.ts";
import { ExitError } from "../shutdown.ts";

export interface CommandContext extends AppContext {
	spinner: Spinner;
}

interface WithCommandOptions {
	/** Spinner text shown during execution. If omitted, no spinner is started. */
	spinnerText?: string;
	/** Error message for spinner.error(). Defaults to "Failed". */
	errorLabel?: string;
}

const noopSpinner: Spinner = {
	update() {},
	success() {},
	error() {},
	stop() {},
};

/**
 * Wrap a command action with standard context setup, spinner, error handling,
 * and manager cleanup.
 *
 * The handler receives { config, manager, formatOptions, spinner } and should:
 *   1. Do async work
 *   2. Call spinner.stop() when done
 *   3. Output results via console.log()
 *
 * Errors are caught, formatted, and cause process.exit(1).
 * manager.close() is always called in finally.
 */
export function withCommand<TArgs extends unknown[]>(
	program: Command,
	options: WithCommandOptions,
	handler: (ctx: CommandContext, ...args: TArgs) => Promise<void>,
): (...args: TArgs) => Promise<void> {
	return async (...args: TArgs) => {
		const appCtx = await getContext(program);
		const { manager, formatOptions } = appCtx;

		const spinner = options.spinnerText ? logger.startSpinner(options.spinnerText, formatOptions) : noopSpinner;

		try {
			await handler({ ...appCtx, spinner }, ...args);
		} catch (err) {
			if (err instanceof ExitError) throw err;
			spinner.error(options.errorLabel ?? "Failed");
			console.error(formatError(String(err), formatOptions));
			throw new ExitError(1);
		} finally {
			await manager.close();
		}
	};
}
