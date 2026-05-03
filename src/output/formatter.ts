import ansis, { bold, cyan, dim, green, red, yellow } from "ansis";
import type { PromptWithServer, ResourceWithServer, ToolWithServer } from "../client/manager.ts";
import type { Prompt, Resource, Tool } from "../config/schemas.ts";
import type { SearchResult } from "../search/index.ts";
import type { ValidationError } from "../validation/schema.ts";
import { formatOutput } from "./format-output.ts";
import { formatTable } from "./format-table.ts";

export const VALID_FORMATS = ["json", "markdown"] as const;

export type OutputFormat = (typeof VALID_FORMATS)[number];

export interface FormatOptions {
	json?: boolean;
	withDescriptions?: boolean;
	verbose?: boolean;
	showSecrets?: boolean;
	logLevel?: string;
	format?: OutputFormat;
}

export interface UnifiedItem {
	server: string;
	type: "tool" | "resource" | "prompt";
	name: string;
	description?: string;
}

/** Check if stdout is a TTY (interactive terminal) */
export function isInteractive(options: FormatOptions): boolean {
	if (options.json) return false;
	return process.stdout.isTTY ?? false;
}

/** Get terminal width, or undefined if not a TTY. Subtracts 1 for safety margin. */
function getTerminalWidth(): number | undefined {
	if (process.stdout.isTTY) return Math.max(process.stdout.columns - 1, 40);
	return undefined;
}

/** Measure visible length of a string (excluding ANSI escape codes) */
function visibleLength(s: string): number {
	return ansis.strip(s).length;
}

/** Word-wrap text to a max width, hard-breaking words that exceed it */
function wrapLines(text: string, maxWidth: number): string[] {
	const words = text.split(/\s+/).filter((w) => w.length > 0);
	if (words.length === 0) return [""];

	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		if (word.length > maxWidth) {
			if (current) {
				lines.push(current);
				current = "";
			}
			for (let j = 0; j < word.length; j += maxWidth) {
				lines.push(word.slice(j, j + maxWidth));
			}
			continue;
		}
		if (current.length === 0) {
			current = word;
		} else if (current.length + 1 + word.length <= maxWidth) {
			current += ` ${word}`;
		} else {
			lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines;
}

/**
 * Word-wrap a description string to fit within the available terminal width.
 * Returns dim()-wrapped text with continuation lines indented to prefixWidth.
 * @param text - raw description text (before dim())
 * @param prefixWidth - visible character width of everything before the description
 * @param termWidth - terminal width in columns
 */
export function wrapDescription(text: string, prefixWidth: number, termWidth: number): string {
	const available = termWidth - prefixWidth;

	// If prefix is so wide there's barely room, wrap onto the next line with a small indent
	if (available < 20) {
		const fallbackIndent = Math.min(prefixWidth, 4);
		const fallbackAvail = termWidth - fallbackIndent;
		if (fallbackAvail < 20) {
			return dim(text.length > termWidth ? `${text.slice(0, termWidth - 3)}...` : text);
		}
		const wrapped = wrapLines(text, fallbackAvail);
		const indent = " ".repeat(fallbackIndent);
		return wrapped.map((l) => `\n${indent}${dim(l)}`).join("");
	}

	const wrapped = wrapLines(text, available);
	const indent = " ".repeat(prefixWidth);
	return wrapped.map((l, i) => (i === 0 ? dim(l) : `\n${indent}${dim(l)}`)).join("");
}

export interface ServerOverview {
	serverName: string;
	version?: { name: string; version: string };
	capabilities?: Record<string, unknown>;
	instructions?: string;
	tools: Tool[];
	resourceCount: number;
	promptCount: number;
}

const KNOWN_CAPABILITIES = ["tools", "resources", "prompts", "logging", "completions", "tasks"];

/** Format a full server overview (version, capabilities, tools, counts) */
export function formatServerOverview(overview: ServerOverview, options: FormatOptions): string {
	return formatOutput(
		{
			server: overview.serverName,
			version: overview.version ?? null,
			capabilities: overview.capabilities ?? null,
			instructions: overview.instructions ?? null,
			tools: overview.tools.map((t) => ({ name: t.name, description: t.description ?? "" })),
			resourceCount: overview.resourceCount,
			promptCount: overview.promptCount,
		},
		() => {
			const lines: string[] = [];

			// Header: server name + version
			const header = cyan.bold(overview.serverName);
			if (overview.version) {
				lines.push(`${header}  ${dim(`v${overview.version.version}`)}  ${dim(`(${overview.version.name})`)}`);
			} else {
				lines.push(header);
			}

			// Capabilities
			if (overview.capabilities) {
				lines.push("");
				lines.push(bold("Capabilities:"));
				const caps = overview.capabilities;
				const present = KNOWN_CAPABILITIES.filter((k) => k in caps);
				const absent = KNOWN_CAPABILITIES.filter((k) => !(k in caps));
				for (const k of present) lines.push(`  ${green("✓")} ${k}`);
				for (const k of absent) lines.push(`  ${dim("✗")} ${dim(k)}`);
			}

			// Instructions
			if (overview.instructions) {
				lines.push("");
				lines.push(bold("Instructions:"));
				lines.push(`  ${dim(overview.instructions)}`);
			}

			// Tools
			lines.push("");
			if (overview.tools.length === 0) {
				lines.push(`${bold("Tools:")} ${dim("none")}`);
			} else {
				lines.push(bold(`Tools (${overview.tools.length}):`));
				const maxName = Math.max(...overview.tools.map((t) => t.name.length));
				const termWidth = getTerminalWidth();
				for (let i = 0; i < overview.tools.length; i++) {
					const t = overview.tools[i]!;
					if (i > 0) lines.push("");
					const name = `  ${bold(t.name.padEnd(maxName))}`;
					if (t.description) {
						const pw = visibleLength(name) + 2;
						const desc = termWidth != null ? wrapDescription(t.description, pw, termWidth) : dim(t.description);
						lines.push(`${name}  ${desc}`);
					} else {
						lines.push(name);
					}
				}
			}

			// Resource/prompt counts
			const counts: string[] = [];
			counts.push(`Resources: ${overview.resourceCount}`);
			counts.push(`Prompts: ${overview.promptCount}`);
			lines.push("");
			lines.push(dim(counts.join(" | ")));

			return lines.join("\n");
		},
		options,
	);
}

/** Format a list of tools with server names */
export function formatToolList(tools: ToolWithServer[], options: FormatOptions): string {
	return formatOutput(
		tools.map((t) => ({
			server: t.server,
			tool: t.tool.name,
			...(options.withDescriptions ? { description: t.tool.description ?? "" } : {}),
		})),
		() =>
			formatTable(tools, {
				columns: [
					{ value: (t) => t.server, style: cyan },
					{ value: (t) => t.tool.name, style: bold },
				],
				description: options.withDescriptions ? (t) => t.tool.description : undefined,
				emptyMessage: "No tools found",
			}),
		options,
	);
}

/** Format tools for a single server */
export function formatServerTools(serverName: string, tools: Tool[], options: FormatOptions): string {
	return formatOutput(
		{
			server: serverName,
			tools: tools.map((t) => ({ name: t.name, description: t.description ?? "" })),
		},
		() => {
			if (tools.length === 0) {
				return dim(`No tools found for ${serverName}`);
			}
			const header = cyan.bold(serverName);
			const body = formatTable(tools, {
				columns: [{ value: (t) => `  ${t.name}`, style: bold }],
				description: (t) => t.description,
			});
			return `${header}\n${body}`;
		},
		options,
	);
}

/** Format a tool schema */
export function formatToolSchema(serverName: string, tool: Tool, options: FormatOptions): string {
	return formatOutput(
		{
			server: serverName,
			tool: tool.name,
			description: tool.description ?? "",
			inputSchema: tool.inputSchema,
		},
		() => {
			const lines: string[] = [];
			lines.push(`${cyan(serverName)}/${bold(tool.name)}`);
			if (tool.description) lines.push(dim(tool.description));
			lines.push("");
			lines.push(bold("Input Schema:"));
			lines.push(formatSchema(tool.inputSchema, 2));
			return lines.join("\n");
		},
		options,
	);
}

/** Format a JSON schema as a readable parameter list */
function formatSchema(schema: Tool["inputSchema"], indent: number): string {
	const pad = " ".repeat(indent);
	const properties = schema.properties ?? {};
	const required = new Set(schema.required ?? []);

	if (Object.keys(properties).length === 0) {
		return `${pad}${dim("(no parameters)")}`;
	}

	return Object.entries(properties)
		.map(([name, prop]) => {
			const p = prop as Record<string, unknown>;
			const type = (p.type as string) ?? "any";
			const req = required.has(name) ? red("*") : "";
			const desc = p.description ? `  ${dim(String(p.description))}` : "";
			return `${pad}${green(name)}${req} ${dim(`(${type})`)}${desc}`;
		})
		.join("\n");
}

/** Format detailed tool help with example payload */
export function formatToolHelp(serverName: string, tool: Tool, options: FormatOptions): string {
	return formatOutput(
		{
			server: serverName,
			tool: tool.name,
			description: tool.description ?? "",
			inputSchema: tool.inputSchema,
			example: generateExample(tool.inputSchema),
		},
		() => {
			const lines: string[] = [];
			lines.push(`${cyan(serverName)}/${bold(tool.name)}`);
			if (tool.description) lines.push(dim(tool.description));
			lines.push("");
			lines.push(bold("Parameters:"));
			lines.push(formatSchema(tool.inputSchema, 2));
			const example = generateExample(tool.inputSchema);
			lines.push("");
			lines.push(bold("Example:"));
			lines.push(dim(`  mcpx call ${serverName} ${tool.name} '${JSON.stringify(example)}'`));
			return lines.join("\n");
		},
		options,
	);
}

/** Generate an example payload from a JSON schema */
function generateExample(schema: Tool["inputSchema"]): Record<string, unknown> {
	const properties = schema.properties ?? {};
	const required = new Set(schema.required ?? []);
	const example: Record<string, unknown> = {};

	for (const [name, prop] of Object.entries(properties)) {
		const p = prop as Record<string, unknown>;
		if (required.has(name) || Object.keys(example).length < 3) {
			example[name] = exampleValue(name, p);
		}
	}

	return example;
}

function exampleValue(name: string, prop: Record<string, unknown>): unknown {
	if (Array.isArray(prop.enum) && prop.enum.length > 0) return prop.enum[0];
	if (prop.default !== undefined) return prop.default;

	const type = prop.type as string | undefined;
	switch (type) {
		case "string":
			return `<${name}>`;
		case "number":
		case "integer":
			return 0;
		case "boolean":
			return true;
		case "array":
			return [];
		case "object":
			return {};
		default:
			return `<${name}>`;
	}
}

/** Format a tool call result, dispatching on the --format option */
export function formatCallResult(result: unknown, options: FormatOptions): string {
	const format = options.format ?? "json";

	switch (format) {
		case "markdown":
			return formatCallResultAsMarkdown(result);
		default:
			return JSON.stringify(parseNestedJson(result), null, 2);
	}
}

/** Render an MCP tool call result as styled markdown for terminal output */
function formatCallResultAsMarkdown(result: unknown): string {
	const r = result as {
		content?: Array<{
			type: string;
			text?: string;
			data?: string;
			mimeType?: string;
			uri?: string;
		}>;
		structuredContent?: unknown;
		_meta?: unknown;
		isError?: boolean;
	};

	const hasContent = Array.isArray(r.content) && r.content.length > 0;
	const hasStructured = r.structuredContent !== undefined && r.structuredContent !== null;
	const hasMeta =
		r._meta !== undefined &&
		r._meta !== null &&
		!(typeof r._meta === "object" && Object.keys(r._meta as object).length === 0);

	if (!hasContent && !hasStructured && !hasMeta) {
		return renderMarkdownToAnsi(jsonToMarkdown(result));
	}

	const parts: string[] = [];

	for (const block of r.content ?? []) {
		switch (block.type) {
			case "text":
				if (block.text !== undefined) {
					try {
						const parsed = JSON.parse(block.text);
						parts.push(jsonToMarkdown(parsed));
					} catch {
						// Plain text / already markdown — pass through as-is
						parts.push(block.text);
					}
				}
				break;
			case "image":
				parts.push(
					`[image: ${block.mimeType ?? "unknown type"}, ${block.data ? Math.ceil((block.data.length * 3) / 4) : 0} bytes]`,
				);
				break;
			case "audio":
				parts.push(
					`[audio: ${block.mimeType ?? "unknown type"}, ${block.data ? Math.ceil((block.data.length * 3) / 4) : 0} bytes]`,
				);
				break;
			case "resource":
				parts.push(`[resource: ${block.uri ?? "unknown"}]`);
				break;
			case "resource_link":
				parts.push(`[resource_link: ${block.uri ?? "unknown"}]`);
				break;
			default:
				parts.push(`[${block.type}]\n\n\`\`\`json\n${JSON.stringify(block, null, 2)}\n\`\`\``);
				break;
		}
	}

	if (hasStructured) {
		parts.push(`**Structured Content:**\n\n${jsonToMarkdown(r.structuredContent)}`);
	}

	if (hasMeta) {
		parts.push(`**Meta:**\n\n${jsonToMarkdown(r._meta)}`);
	}

	let output = parts.join("\n\n");
	if (r.isError) {
		output = `**error:** ${output}`;
	}
	return renderMarkdownToAnsi(output);
}

/** Convert a key name like "display_name" to "Display Name" */
function humanizeKey(key: string): string {
	return key
		.replace(/[_-]/g, " ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Check if a value is a plain primitive (string, number, boolean, null) */
function isPrimitive(value: unknown): value is string | number | boolean | null {
	return value === null || typeof value !== "object";
}

/**
 * URL placeholders: Bun.markdown.ansi() wraps and auto-links URLs, so we
 * replace them with short tokens before rendering, then swap them back after.
 */
let urlCounter = 0;
let urlMap = new Map<string, string>();

function resetUrlPlaceholders(): void {
	urlCounter = 0;
	urlMap = new Map();
}

function restoreUrlPlaceholders(ansiOutput: string): string {
	for (const [token, url] of urlMap) {
		ansiOutput = ansiOutput.replace(token, `\x1b[34m\x1b[4m${url}\x1b[24m\x1b[39m`);
	}
	return ansiOutput;
}

/** Format a primitive value, replacing URLs with placeholders to avoid mangling */
function formatPrimitive(value: string | number | boolean | null): string {
	const str = String(value ?? "null");
	if (typeof value === "string" && /^https?:\/\/\S+$/.test(value)) {
		const token = `URLPLACEHOLDER${urlCounter++}`;
		urlMap.set(token, str);
		return token;
	}
	return str;
}

/** Normalize a key for label matching: lowercase, strip underscores/hyphens */
function normalizeKey(key: string): string {
	return key.replace(/[_-]/g, "").toLowerCase();
}

/** Priority-ordered label keys (checked after normalization) */
const LABEL_KEYS = [
	"name",
	"displayname",
	"fullname",
	"username",
	"screenname",
	"title",
	"subject",
	"headline",
	"heading",
	"label",
	"description",
	"summary",
	"email",
	"url",
	"slug",
	"key",
	"identifier",
];

/** Find the best label field in an object, returning { originalKey, value } or null */
function findLabel(obj: Record<string, unknown>): { originalKey: string; value: string } | null {
	const entries = Object.entries(obj);
	for (const candidate of LABEL_KEYS) {
		for (const [key, val] of entries) {
			if (normalizeKey(key) === candidate && typeof val === "string" && val.length > 0) {
				return { originalKey: key, value: val };
			}
		}
	}
	return null;
}

/** Render object entries as an indented bullet list */
function objectToBullets(entries: [string, unknown][], indent: number, skipKey?: string): string {
	const prefix = " ".repeat(indent);
	const lines: string[] = [];

	for (const [key, val] of entries) {
		if (key === skipKey) continue;
		const heading = humanizeKey(key);

		if (isPrimitive(val)) {
			lines.push(`${prefix}- **${heading}:** ${formatPrimitive(val)}`);
		} else if (Array.isArray(val) && val.every(isPrimitive)) {
			lines.push(`${prefix}- **${heading}:**`);
			for (const v of val) {
				lines.push(`${prefix}  - ${formatPrimitive(v)}`);
			}
		} else if (Array.isArray(val)) {
			lines.push(`${prefix}- **${heading}:**`);
			for (const item of val) {
				if (isPrimitive(item)) {
					lines.push(`${prefix}  - ${formatPrimitive(item)}`);
				} else {
					const itemObj = item as Record<string, unknown>;
					const label = findLabel(itemObj);
					if (label) {
						lines.push(`${prefix}  - ${label.value}`);
						lines.push(objectToBullets(Object.entries(itemObj), indent + 4, label.originalKey));
					} else {
						lines.push(`${prefix}  -`);
						lines.push(objectToBullets(Object.entries(itemObj), indent + 4));
					}
				}
			}
		} else {
			lines.push(`${prefix}- **${heading}:**`);
			lines.push(objectToBullets(Object.entries(val as Record<string, unknown>), indent + 2));
		}
	}

	return lines.join("\n");
}

/**
 * Convert a JSON value into a readable markdown document.
 * Depth 1–2 use headings; depth 3+ switch to compact bullet lists.
 * Arrays of objects use a label field (name, title, etc.) in the heading when available.
 */
export function jsonToMarkdown(value: unknown, depth: number = 1, skipKey?: string): string {
	if (isPrimitive(value)) {
		return formatPrimitive(value);
	}

	// At depth >= 3, switch to bullet-list rendering
	if (depth >= 3) {
		if (Array.isArray(value)) {
			if (value.every(isPrimitive)) {
				return value.map((v) => `- ${formatPrimitive(v)}`).join("\n");
			}
			return value
				.map((item) => {
					if (isPrimitive(item)) return `- ${formatPrimitive(item)}`;
					const obj = item as Record<string, unknown>;
					const label = findLabel(obj);
					const header = label ? `- ${label.value}` : `-`;
					return `${header}\n${objectToBullets(Object.entries(obj), 2, label?.originalKey)}`;
				})
				.join("\n");
		}
		return objectToBullets(Object.entries(value as Record<string, unknown>), 0, skipKey);
	}

	if (Array.isArray(value)) {
		// Array of all primitives → bullet list
		if (value.every(isPrimitive)) {
			return value.map((v) => `- ${formatPrimitive(v)}`).join("\n");
		}
		// Array of objects → numbered sub-sections with label
		return value
			.map((item, i) => {
				if (isPrimitive(item)) {
					return `- ${formatPrimitive(item)}`;
				}
				const obj = item as Record<string, unknown>;
				const labelInfo = findLabel(obj);
				const numberLabel = labelInfo ? `${i + 1}. ${labelInfo.value}` : `${i + 1}`;
				const heading = depth <= 6 ? `${"#".repeat(depth)} ${numberLabel}` : `**${numberLabel}**`;
				return `${heading}\n\n${jsonToMarkdown(item, depth + 1, labelInfo?.originalKey)}`;
			})
			.join("\n\n");
	}

	// Object → each key becomes a heading
	const entries = Object.entries(value as Record<string, unknown>);
	const lines: string[] = [];

	for (const [key, val] of entries) {
		const heading = humanizeKey(key);

		if (isPrimitive(val)) {
			if (depth <= 6) {
				lines.push(`${"#".repeat(depth)} ${heading}\n\n${formatPrimitive(val)}`);
			} else {
				lines.push(`**${heading}:** ${formatPrimitive(val)}`);
			}
		} else if (Array.isArray(val) && val.every(isPrimitive)) {
			// Array of primitives: heading then bullet list
			const list = val.map((v) => `- ${formatPrimitive(v)}`).join("\n");
			if (depth <= 6) {
				lines.push(`${"#".repeat(depth)} ${heading}\n\n${list}`);
			} else {
				lines.push(`**${heading}:**\n${list}`);
			}
		} else {
			// Nested object or array of objects
			const label = depth <= 6 ? `${"#".repeat(depth)} ${heading}` : `**${heading}**`;
			lines.push(`${label}\n\n${jsonToMarkdown(val, depth + 1)}`);
		}
	}

	return lines.join("\n\n");
}

/** Render a markdown string to ANSI-styled terminal output using Bun's built-in renderer */
export function renderMarkdownToAnsi(input: string): string {
	// biome-ignore lint/suspicious/noExplicitAny: Bun.markdown.ansi is not yet in @types/bun
	const result = (Bun as any).markdown.ansi(input) as string;
	const restored = restoreUrlPlaceholders(result);
	resetUrlPlaceholders();
	return restored;
}

const MAX_NESTED_JSON_DEPTH = 10;

/** Recursively parse JSON strings inside MCP content blocks */
function parseNestedJson(value: unknown, depth = 0): unknown {
	if (depth > MAX_NESTED_JSON_DEPTH) return value;
	if (typeof value === "string") {
		try {
			return parseNestedJson(JSON.parse(value), depth + 1);
		} catch {
			return value;
		}
	}
	if (Array.isArray(value)) {
		return value.map((v) => parseNestedJson(v, depth + 1));
	}
	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, parseNestedJson(v, depth + 1)]));
	}
	return value;
}

/** Format validation errors for tool input */
export function formatValidationErrors(
	serverName: string,
	toolName: string,
	errors: ValidationError[],
	options: FormatOptions,
): string {
	return formatOutput(
		{ error: "validation", server: serverName, tool: toolName, details: errors },
		() => {
			const header = `${red("error:")} invalid arguments for ${cyan(serverName)}/${bold(toolName)}`;
			const details = errors.map((e) => `  ${yellow(e.path)}: ${e.message}`).join("\n");
			return `${header}\n${details}`;
		},
		options,
	);
}

/** Format search results */
export function formatSearchResults(results: SearchResult[], options: FormatOptions): string {
	return formatOutput(
		results,
		() => {
			if (results.length === 0) {
				return dim("No matching tools found");
			}

			const termWidth = getTerminalWidth();
			const descIndent = 2;

			return results
				.map((r) => {
					const header = `${cyan(r.server)}  ${bold(r.tool)}  ${yellow(r.score.toFixed(2))}`;
					const fullDesc = r.description
						.split("\n")
						.map((l) => l.trim())
						.filter((l) => l.length > 0)
						.join(" ");
					const indent = " ".repeat(descIndent);
					const desc = termWidth != null ? wrapDescription(fullDesc, descIndent, termWidth) : dim(fullDesc);
					return `${header}\n${indent}${desc}`;
				})
				.join("\n\n");
		},
		options,
	);
}

/** Format a list of resources with server names */
export function formatResourceList(resources: ResourceWithServer[], options: FormatOptions): string {
	return formatOutput(
		resources.map((r) => ({
			server: r.server,
			uri: r.resource.uri,
			name: r.resource.name,
			...(options.withDescriptions ? { description: r.resource.description ?? "" } : {}),
		})),
		() =>
			formatTable(resources, {
				columns: [
					{ value: (r) => r.server, style: cyan },
					{ value: (r) => r.resource.uri, style: bold },
				],
				description: options.withDescriptions ? (r) => r.resource.description : undefined,
				emptyMessage: "No resources found",
			}),
		options,
	);
}

/** Format resources for a single server */
export function formatServerResources(serverName: string, resources: Resource[], options: FormatOptions): string {
	return formatOutput(
		{
			server: serverName,
			resources: resources.map((r) => ({
				uri: r.uri,
				name: r.name,
				description: r.description ?? "",
				mimeType: r.mimeType ?? "",
			})),
		},
		() => {
			if (resources.length === 0) {
				return dim(`No resources found for ${serverName}`);
			}
			const header = cyan.bold(serverName);
			const body = formatTable(resources, {
				columns: [{ value: (r) => `  ${r.uri}`, style: bold }],
				description: (r) => r.description,
			});
			return `${header}\n${body}`;
		},
		options,
	);
}

/** Format resource contents */
export function formatResourceContents(
	serverName: string,
	uri: string,
	result: unknown,
	options: FormatOptions,
): string {
	return formatOutput(
		{ server: serverName, uri, contents: (result as { contents: unknown })?.contents ?? result },
		() => {
			const contents =
				(result as { contents?: Array<{ text?: string; blob?: string; mimeType?: string }> })?.contents ?? [];
			const lines: string[] = [];
			lines.push(`${cyan(serverName)}/${bold(uri)}`);
			lines.push("");

			if (contents.length === 0) {
				lines.push(dim("(empty)"));
			} else {
				for (const item of contents) {
					if (item.text !== undefined) {
						lines.push(item.text);
					} else if (item.blob !== undefined) {
						lines.push(dim(`<binary blob, ${item.blob.length} bytes base64>`));
					}
				}
			}

			return lines.join("\n");
		},
		options,
	);
}

/** Format a list of prompts with server names */
export function formatPromptList(prompts: PromptWithServer[], options: FormatOptions): string {
	return formatOutput(
		prompts.map((p) => ({
			server: p.server,
			name: p.prompt.name,
			...(options.withDescriptions ? { description: p.prompt.description ?? "" } : {}),
		})),
		() =>
			formatTable(prompts, {
				columns: [
					{ value: (p) => p.server, style: cyan },
					{ value: (p) => p.prompt.name, style: bold },
				],
				description: options.withDescriptions ? (p) => p.prompt.description : undefined,
				emptyMessage: "No prompts found",
			}),
		options,
	);
}

/** Format prompts for a single server */
export function formatServerPrompts(serverName: string, prompts: Prompt[], options: FormatOptions): string {
	return formatOutput(
		{
			server: serverName,
			prompts: prompts.map((p) => ({
				name: p.name,
				description: p.description ?? "",
				arguments: p.arguments ?? [],
			})),
		},
		() => {
			if (prompts.length === 0) {
				return dim(`No prompts found for ${serverName}`);
			}

			const header = cyan.bold(serverName);
			const maxName = Math.max(...prompts.map((p) => p.name.length));
			const termWidth = getTerminalWidth();

			const lines = prompts.map((p) => {
				const name = `  ${bold(p.name.padEnd(maxName))}`;
				const args =
					p.arguments && p.arguments.length > 0
						? `  ${dim(`(${p.arguments.map((a) => (a.required ? a.name : `[${a.name}]`)).join(", ")})`)}`
						: "";
				if (p.description) {
					const prefix = `${name}${args}`;
					const pw = visibleLength(prefix) + 2;
					const desc = termWidth != null ? wrapDescription(p.description, pw, termWidth) : dim(p.description);
					return `${prefix}  ${desc}`;
				}
				return `${name}${args}`;
			});

			return [header, ...lines].join("\n");
		},
		options,
	);
}

/** Format prompt messages */
export function formatPromptMessages(
	serverName: string,
	name: string,
	result: unknown,
	options: FormatOptions,
): string {
	return formatOutput(
		{ server: serverName, prompt: name, ...(result as object) },
		() => {
			const r = result as {
				description?: string;
				messages?: Array<{ role: string; content: { type: string; text?: string } }>;
			};
			const lines: string[] = [];
			lines.push(`${cyan(serverName)}/${bold(name)}`);
			if (r.description) lines.push(dim(r.description));
			lines.push("");
			for (const msg of r.messages ?? []) {
				lines.push(`${bold(msg.role)}:`);
				if (msg.content.text !== undefined) {
					lines.push(`  ${msg.content.text}`);
				}
			}
			return lines.join("\n");
		},
		options,
	);
}

/** Format a unified list of tools, resources, and prompts across servers */
export function formatUnifiedList(items: UnifiedItem[], options: FormatOptions): string {
	const typeLabel = (t: string) => {
		if (t === "tool") return green(t);
		if (t === "resource") return cyan(t);
		return yellow(t);
	};

	return formatOutput(
		items.map((i) => ({
			server: i.server,
			type: i.type,
			name: i.name,
			...(options.withDescriptions ? { description: i.description ?? "" } : {}),
		})),
		() =>
			formatTable(items, {
				columns: [
					{ value: (i) => i.server, style: cyan },
					{ value: (i) => i.type, style: typeLabel },
					{ value: (i) => i.name, style: bold },
				],
				description: options.withDescriptions ? (i) => i.description : undefined,
				emptyMessage: "No tools, resources, or prompts found",
			}),
		options,
	);
}

/** Format a single task status */
export function formatTaskStatus(
	task: { taskId: string; status: string; [key: string]: unknown },
	options: FormatOptions,
): string {
	return formatOutput(
		task,
		() => {
			const statusColor = (s: string) => {
				switch (s) {
					case "completed":
						return green(s);
					case "working":
						return yellow(s);
					case "failed":
					case "cancelled":
						return red(s);
					case "input_required":
						return yellow(s);
					default:
						return s;
				}
			};

			const lines: string[] = [];
			lines.push(`${bold("Task:")} ${cyan(task.taskId)}`);
			lines.push(`${bold("Status:")} ${statusColor(task.status)}`);
			if (task.statusMessage) lines.push(`${bold("Message:")} ${dim(String(task.statusMessage))}`);
			if (task.createdAt) lines.push(`${bold("Created:")} ${dim(String(task.createdAt))}`);
			if (task.lastUpdatedAt) lines.push(`${bold("Updated:")} ${dim(String(task.lastUpdatedAt))}`);
			if (task.ttl != null) lines.push(`${bold("TTL:")} ${dim(`${String(task.ttl)}ms`)}`);
			if (task.pollInterval != null) lines.push(`${bold("Poll interval:")} ${dim(`${String(task.pollInterval)}ms`)}`);
			return lines.join("\n");
		},
		options,
	);
}

/** Format a list of tasks */
export function formatTasksList(
	tasks: Array<{ taskId: string; status: string; [key: string]: unknown }>,
	nextCursor: string | undefined,
	options: FormatOptions,
): string {
	return formatOutput(
		{ tasks, ...(nextCursor ? { nextCursor } : {}) },
		() => {
			if (tasks.length === 0) {
				return dim("No tasks found");
			}

			const statusColor = (s: string) => {
				switch (s) {
					case "completed":
						return green(s.padEnd(14));
					case "working":
						return yellow(s.padEnd(14));
					case "failed":
					case "cancelled":
						return red(s.padEnd(14));
					default:
						return s.padEnd(14);
				}
			};

			const maxId = Math.max(...tasks.map((t) => t.taskId.length));

			const lines = tasks.map((t) => {
				const id = cyan(t.taskId.padEnd(maxId));
				const status = statusColor(t.status);
				const updated = t.lastUpdatedAt ? dim(String(t.lastUpdatedAt)) : "";
				return `${id}  ${status}  ${updated}`;
			});

			if (nextCursor) {
				lines.push("");
				lines.push(dim(`Next cursor: ${nextCursor}`));
			}

			return lines.join("\n");
		},
		options,
	);
}

/** Format task creation output (for --no-wait) */
export function formatTaskCreated(
	task: { taskId: string; status: string; [key: string]: unknown },
	options: FormatOptions,
): string {
	return formatOutput(
		{ task },
		() => `${green("Task created:")} ${cyan(task.taskId)} ${dim(`(status: ${task.status})`)}`,
		options,
	);
}

/** Format an error message */
export function formatError(message: string, options: FormatOptions): string {
	return formatOutput({ error: message }, () => `${red("error:")} ${message}`, options);
}
