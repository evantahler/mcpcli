import type { FormatOptions } from "./formatter.ts";
import { isInteractive } from "./formatter.ts";

/**
 * Format output with automatic JSON/interactive branching.
 * When --format is explicitly set, it takes precedence:
 *   json → JSON.stringify of jsonData
 *   text or markdown → interactiveFn() (already well-formatted for non-exec commands)
 * Otherwise falls back to the existing auto-detection:
 *   non-interactive → JSON, interactive → formatted text.
 */
export function formatOutput(
  jsonData: unknown,
  interactiveFn: () => string,
  options: FormatOptions,
): string {
  if (options.format) {
    if (options.format === "json") {
      return JSON.stringify(jsonData, null, 2);
    }
    // text and markdown use the interactive formatter for non-exec commands
    return interactiveFn();
  }
  if (!isInteractive(options)) {
    return JSON.stringify(jsonData, null, 2);
  }
  return interactiveFn();
}
