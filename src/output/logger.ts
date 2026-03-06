import { createSpinner } from "nanospinner";
import { dim, yellow, red } from "ansis";
import type { FormatOptions } from "./formatter.ts";

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

  /** Set format options (called once during context setup) */
  configure(options: FormatOptions): void {
    this.formatOptions = options;
  }

  /** Whether interactive output is suppressed (JSON mode or non-TTY stderr) */
  private isSilent(): boolean {
    return !!this.formatOptions.json || !(process.stderr.isTTY ?? false);
  }

  /** Write a line to stderr, pausing any active spinner around the write */
  private writeStderr(msg: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.clear();
      process.stderr.write(msg + "\n");
      this.activeSpinner.render();
    } else {
      process.stderr.write(msg + "\n");
    }
  }

  /** Info-level message (dim text on stderr). Suppressed in JSON/non-TTY mode. */
  info(msg: string): void {
    if (this.isSilent()) return;
    this.writeStderr(dim(msg));
  }

  /** Warning message (yellow text on stderr). Suppressed in JSON/non-TTY mode. */
  warn(msg: string): void {
    if (this.isSilent()) return;
    this.writeStderr(yellow(msg));
  }

  /** Error message (red text on stderr). Always writes. */
  error(msg: string): void {
    this.writeStderr(red(msg));
  }

  /** Debug/verbose message (dim text on stderr). Only when verbose is enabled. */
  debug(msg: string): void {
    if (!this.formatOptions.verbose || this.isSilent()) return;
    this.writeStderr(dim(msg));
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

  /** Start a spinner. Returns the Spinner interface. */
  startSpinner(text: string, options?: FormatOptions): Spinner {
    const opts = options ?? this.formatOptions;

    // No spinner in JSON/piped mode
    if (opts.json || !(process.stderr.isTTY ?? false)) {
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
