import { createSpinner } from "nanospinner";
import type { FormatOptions } from "./formatter.ts";

export interface Spinner {
  update(text: string): void;
  success(text?: string): void;
  error(text?: string): void;
  stop(): void;
}

/** Create a spinner that only renders in interactive mode */
export function startSpinner(text: string, options: FormatOptions): Spinner {
  // No spinner in JSON/piped mode
  if (options.json || !(process.stderr.isTTY ?? false)) {
    return {
      update() {},
      success() {},
      error() {},
      stop() {},
    };
  }

  const spinner = createSpinner(text, { stream: process.stderr }).start();

  return {
    update(text: string) {
      spinner.update({ text });
    },
    success(text?: string) {
      spinner.success({ text });
    },
    error(text?: string) {
      spinner.error({ text });
    },
    stop() {
      spinner.stop();
    },
  };
}
