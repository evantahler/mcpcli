/**
 * Shared helpers for parsing JSON arguments and reading from stdin.
 */

/** Parse a JSON string as a key-value object, optionally coercing all values to strings. */
export function parseJsonArgs(
  str: string,
  opts?: { coerceToString?: boolean },
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Arguments must be a JSON object");
    }
    if (opts?.coerceToString) {
      return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${err.message}`);
    }
    throw err;
  }
}

/** Read all data from stdin until EOF. */
export async function readStdin(): Promise<string> {
  const chunks: string[] = [];
  const reader = process.stdin;
  reader.setEncoding("utf-8");
  for await (const chunk of reader) {
    chunks.push(chunk as string);
  }
  return chunks.join("");
}
