import type { FormatOptions } from "./formatter.ts";
import { isInteractive } from "./formatter.ts";

/**
 * Format output with automatic JSON/interactive branching.
 * In non-interactive mode, returns JSON.stringify of jsonData.
 * In interactive mode, calls interactiveFn() for formatted output.
 */
export function formatOutput(
  jsonData: unknown,
  interactiveFn: () => string,
  options: FormatOptions,
): string {
  if (!isInteractive(options)) {
    return JSON.stringify(jsonData, null, 2);
  }
  return interactiveFn();
}
