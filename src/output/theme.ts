import ansis, { bold, cyan, dim, green, magenta, red, yellow } from "ansis";
import { useColor } from "./tty.ts";

/**
 * Semantic color tokens for the mcpx CLI. Output modules consume these names
 * (theme.server, theme.success) rather than raw ansis colors so the palette
 * can shift in one place.
 *
 * Each token also gates on useColor() at call time, so flags parsed after
 * module load (e.g. --no-color via context.ts) still suppress output. Direct
 * ansis usage elsewhere is governed by the env vars early-env.ts sets before
 * ansis loads.
 */

const ESC_URL_OPEN = "\x1b[34m\x1b[4m";
const ESC_URL_CLOSE = "\x1b[24m\x1b[39m";

const wrap = (fn: (s: string) => string) => (s: string) => (useColor() ? fn(s) : s);

// Entity tokens — used for nouns the user references
export const server = wrap(cyan.bold);
export const tool = wrap(bold);
export const resource = wrap(cyan);
export const prompt = wrap(magenta);
export const taskId = wrap(cyan);

// Semantic tokens — used for status / severity
export const success = wrap(green);
export const warn = wrap(yellow);
export const error = wrap(red);
export const muted = wrap(dim);

// Detail tokens — finer-grained styling
export const path = wrap(cyan);
export const param = wrap(green);
export const scalar = wrap(yellow);
export const required = wrap(red);
export const url = (s: string): string => (useColor() ? `${ESC_URL_OPEN}${s}${ESC_URL_CLOSE}` : s);
export const label = (s: string): string => (useColor() ? bold(`${s}:`) : `${s}:`);

// Pills — high-contrast inverted badges for type labels (drop into tables)
const pillize = (bgFn: (s: string) => string) => (s: string) =>
	useColor() ? bgFn(` ${s.toUpperCase()} `) : ` ${s.toUpperCase()} `;
export const pillTool = pillize((s) => ansis.bgGreen.black(s));
export const pillResource = pillize((s) => ansis.bgCyan.black(s));
export const pillPrompt = pillize((s) => ansis.bgMagenta.black(s));

// Glyph tokens — single-character status indicators. Defined as getters so
// they re-evaluate the color decision on access.
export const glyph = {
	get ok() {
		return useColor() ? green("✓") : "✓";
	},
	get fail() {
		return useColor() ? red("✗") : "✗";
	},
	get warn() {
		return useColor() ? yellow("⚠") : "⚠";
	},
	get info() {
		return useColor() ? dim("ℹ") : "ℹ";
	},
	get bullet() {
		return useColor() ? dim("•") : "•";
	},
	get arrowOut() {
		return useColor() ? cyan("→") : "→";
	},
	get arrowIn() {
		return useColor() ? green("←") : "←";
	},
	get arrowErr() {
		return useColor() ? red("←") : "←";
	},
	get arrowNote() {
		return useColor() ? yellow("←") : "←";
	},
};

// Render a dim underline `─` of matching visible width (used under headers).
export function underline(visibleWidth: number): string {
	return muted("─".repeat(Math.max(0, visibleWidth)));
}

/** Stack-trace styling: dim "at", bold function name, cyan path, scalar line:col. */
export function styleStackLine(line: string): string {
	if (!useColor()) return line;
	const m = line.match(/^(\s*at\s+)(.+?)\s+\((.+?):(\d+):(\d+)\)\s*$/);
	if (m) {
		const [, atPart, fn, file, ln, col] = m;
		return `${dim(atPart ?? "")}${bold(fn ?? "")} (${cyan(file ?? "")}:${yellow(ln ?? "")}:${yellow(col ?? "")})`;
	}
	const m2 = line.match(/^(\s*at\s+)(.+?):(\d+):(\d+)\s*$/);
	if (m2) {
		const [, atPart, file, ln, col] = m2;
		return `${dim(atPart ?? "")}${cyan(file ?? "")}:${yellow(ln ?? "")}:${yellow(col ?? "")}`;
	}
	return line;
}

export const theme = {
	server,
	tool,
	resource,
	prompt,
	taskId,
	success,
	warn,
	error,
	muted,
	path,
	param,
	scalar,
	required,
	url,
	label,
	pillTool,
	pillResource,
	pillPrompt,
	glyph,
	underline,
	styleStackLine,
};
