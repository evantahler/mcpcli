/**
 * Shared helpers for parsing JSON arguments and reading from stdin.
 */

/** Parse a JSON string as a key-value object, optionally coercing all values to strings. */
export function parseJsonArgs(str: string, opts?: { coerceToString?: boolean }): Record<string, unknown> {
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

type SchemaProperty = {
	type?: string | string[];
	items?: { type?: string | string[] };
};

/**
 * Parse shell-style flag tokens into an arguments object, using a JSON Schema for type
 * coercion. Supports:
 *   --key value, --key=value
 *   --key            (boolean true; only when schema says boolean or schema is unknown)
 *   --no-key         (boolean false; only when `key` is a known boolean field)
 *   repeated flags or comma-separated values for arrays
 *
 * Coerces values to integer/number/boolean according to the field's `type` in the
 * schema. For unknown fields (or empty schema), values are left as strings — Ajv
 * will surface the unknown-field error during validation.
 */
export function parseShellArgs(
	tokens: string[],
	inputSchema: Record<string, unknown> | undefined,
): Record<string, unknown> {
	const properties = (inputSchema?.properties ?? {}) as Record<string, SchemaProperty>;
	const result: Record<string, unknown> = {};
	const seen = new Set<string>();

	function getType(key: string): string | undefined {
		const prop = properties[key];
		if (!prop) return undefined;
		const t = prop.type;
		return Array.isArray(t) ? t[0] : t;
	}

	function getItemType(key: string): string | undefined {
		const t = properties[key]?.items?.type;
		return Array.isArray(t) ? t[0] : t;
	}

	function coerceScalar(key: string, raw: string, type: string | undefined): unknown {
		switch (type) {
			case "string":
				return raw;
			case "integer": {
				const n = Number.parseInt(raw, 10);
				if (Number.isNaN(n) || !/^-?\d+$/.test(raw.trim())) {
					throw new Error(`--${key}: expected integer, got "${raw}"`);
				}
				return n;
			}
			case "number": {
				const n = Number.parseFloat(raw);
				if (Number.isNaN(n)) {
					throw new Error(`--${key}: expected number, got "${raw}"`);
				}
				return n;
			}
			case "boolean": {
				const lower = raw.toLowerCase();
				if (lower === "true" || lower === "1" || lower === "") return true;
				if (lower === "false" || lower === "0") return false;
				throw new Error(`--${key}: expected boolean, got "${raw}"`);
			}
			case "object":
				throw new Error(`--${key}: nested objects are not supported as shell flags — use JSON form`);
			default:
				return raw;
		}
	}

	function assign(key: string, rawValue: string | undefined, isBooleanFlag: boolean): void {
		const type = getType(key);

		if (type === "array") {
			const itemType = getItemType(key);
			const pieces =
				rawValue === undefined
					? [""]
					: rawValue
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
			const coerced = pieces.map((p) => coerceScalar(key, p, itemType));
			const existing = result[key];
			if (Array.isArray(existing)) {
				existing.push(...coerced);
			} else {
				result[key] = coerced;
			}
			return;
		}

		if (seen.has(key)) {
			throw new Error(`--${key}: specified more than once (use comma-separated values for array fields)`);
		}
		seen.add(key);

		if (isBooleanFlag) {
			result[key] = true;
			return;
		}

		if (rawValue === undefined) {
			throw new Error(`--${key}: expected value`);
		}

		result[key] = coerceScalar(key, rawValue, type);
	}

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i] ?? "";

		if (!token.startsWith("--")) {
			throw new Error(`unexpected positional argument "${token}" — use --field=value form`);
		}

		const body = token.slice(2);
		if (body.length === 0) {
			throw new Error('unexpected bare "--" separator');
		}

		const eqIdx = body.indexOf("=");
		let key: string;
		let inlineValue: string | undefined;
		if (eqIdx === -1) {
			key = body;
			inlineValue = undefined;
		} else {
			key = body.slice(0, eqIdx);
			inlineValue = body.slice(eqIdx + 1);
		}

		// --no-key form: only treat as negation when `key` (without "no-") is a known boolean
		if (key.startsWith("no-") && inlineValue === undefined) {
			const bareKey = key.slice(3);
			if (getType(bareKey) === "boolean") {
				if (seen.has(bareKey)) {
					throw new Error(`--${bareKey}: specified more than once`);
				}
				seen.add(bareKey);
				result[bareKey] = false;
				continue;
			}
		}

		const type = getType(key);
		const isBooleanField = type === "boolean";

		if (inlineValue !== undefined) {
			assign(key, inlineValue, false);
			continue;
		}

		// No inline value — peek at next token. Booleans without a value mean "true".
		const next = tokens[i + 1];
		const nextLooksLikeFlag = next?.startsWith("--") === true;
		if (isBooleanField && (next === undefined || nextLooksLikeFlag)) {
			assign(key, undefined, true);
			continue;
		}

		if (next === undefined || nextLooksLikeFlag) {
			throw new Error(`--${key}: expected value`);
		}

		i++;
		assign(key, next, false);
	}

	return result;
}
