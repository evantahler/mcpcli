import { createSpinner } from "nanospinner";
import type { FormatOptions } from "./formatter.ts";
import { glyph, styleStackLine, theme } from "./theme.ts";
import { detectMode, isJson, isVerbose, setMode, useSpinner } from "./tty.ts";

/** MCP log levels ordered by severity (RFC 5424) */
const LOG_LEVELS = ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"] as const;

type LogLevel = (typeof LOG_LEVELS)[number];

function logLevelIndex(level: string): number {
	const idx = LOG_LEVELS.indexOf(level as LogLevel);
	return idx === -1 ? 0 : idx;
}

function colorForLevel(level: string): (s: string) => string {
	switch (level) {
		case "debug":
			return theme.muted;
		case "warning":
			return theme.warn;
		case "error":
		case "critical":
		case "alert":
		case "emergency":
			return theme.error;
		default:
			return (s: string) => s;
	}
}

export interface Spinner {
	update(text: string): void;
	success(text?: string): void;
	error(text?: string): void;
	stop(): void;
}

class Logger {
	private static instance: Logger;
	private activeSpinner: ReturnType<typeof createSpinner> | null = null;
	private formatOptions: FormatOptions = {};

	private constructor() {}

	static getInstance(): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger();
		}
		return Logger.instance;
	}

	/** Set format options (called once during context setup). Also re-resolves the
	 * output mode so verbose/json flags parsed by commander update the global mode. */
	configure(options: FormatOptions): void {
		this.formatOptions = options;
		setMode(
			detectMode({
				json: !!options.json,
				verbose: !!options.verbose,
			}),
		);
	}

	/** Whether interactive output is suppressed (JSON mode or non-TTY stderr) */
	private isSilent(): boolean {
		return isJson() || !(process.stderr.isTTY ?? false);
	}

	/** Write a line to stderr, pausing any active spinner around the write */
	private writeStderr(msg: string): void {
		if (this.activeSpinner) {
			this.activeSpinner.clear();
			process.stderr.write(`${msg}\n`);
			this.activeSpinner.render();
		} else {
			process.stderr.write(`${msg}\n`);
		}
	}

	/** Info-level message (dim text on stderr). Suppressed in JSON/non-TTY mode. */
	info(msg: string): void {
		if (this.isSilent()) return;
		this.writeStderr(theme.muted(msg));
	}

	/** Success message (green ✓ on stderr). Suppressed in JSON/non-TTY mode. */
	success(msg: string): void {
		if (this.isSilent()) return;
		this.writeStderr(`${glyph.ok} ${msg}`);
	}

	/** Warning message (yellow text on stderr). Suppressed in JSON/non-TTY mode. */
	warn(msg: string): void {
		if (this.isSilent()) return;
		this.writeStderr(`${glyph.warn} ${theme.warn(msg)}`);
	}

	/** Error message (red text on stderr). Always writes. */
	error(msg: string): void {
		// If the message looks like a stack trace, style each frame line.
		if (msg.includes("\n") && /\n\s*at\s/.test(msg)) {
			const [first, ...rest] = msg.split("\n");
			const styled = [theme.error(first ?? ""), ...rest.map(styleStackLine)].join("\n");
			this.writeStderr(styled);
			return;
		}
		this.writeStderr(theme.error(msg));
	}

	/** Debug/verbose message (dim text on stderr). Only when verbose is enabled. */
	debug(msg: string): void {
		if (!isVerbose() || this.isSilent()) return;
		this.writeStderr(theme.muted(msg));
	}

	/** Write a raw string to stderr. Spinner-aware but no formatting or newline added. */
	writeRaw(msg: string): void {
		if (this.activeSpinner) {
			this.activeSpinner.clear();
			process.stderr.write(msg);
			this.activeSpinner.render();
		} else {
			process.stderr.write(msg);
		}
	}

	/** Display a structured server log message. Suppressed if below configured log level. */
	logServerMessage(serverName: string, params: { level: string; logger?: string; data: unknown }): void {
		const minLevel = this.formatOptions.logLevel ?? "warning";
		if (logLevelIndex(params.level) < logLevelIndex(minLevel)) return;

		if (isJson()) {
			// JSON mode: structured object to stderr
			const obj = { server: serverName, ...params };
			process.stderr.write(`${JSON.stringify(obj)}\n`);
			return;
		}

		if (!(process.stderr.isTTY ?? false)) return;

		const prefix = params.logger ? `[${serverName}/${params.logger}]` : `[${serverName}]`;
		const dataStr = typeof params.data === "string" ? params.data : JSON.stringify(params.data);
		const line = `${prefix} ${params.level}: ${dataStr}`;
		const color = colorForLevel(params.level);
		this.writeStderr(color(line));
	}

	/** Start a spinner. Returns the Spinner interface. */
	startSpinner(text: string, _options?: FormatOptions): Spinner {
		// No spinner in JSON/piped/verbose mode — verbose writeRaw output conflicts with spinner rendering
		if (!useSpinner() || !(process.stderr.isTTY ?? false)) {
			return { update() {}, success() {}, error() {}, stop() {} };
		}

		const spinner = createSpinner(text, { stream: process.stderr }).start();
		this.activeSpinner = spinner;

		return {
			update: (text: string) => {
				spinner.update({ text });
			},
			success: (text?: string) => {
				spinner.success({ text });
				this.activeSpinner = null;
			},
			error: (text?: string) => {
				spinner.error({ text });
				this.activeSpinner = null;
			},
			stop: () => {
				spinner.stop();
				this.activeSpinner = null;
			},
		};
	}
}

/** The singleton logger instance */
export const logger = Logger.getInstance();
