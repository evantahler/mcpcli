/**
 * Single source of truth for whether the CLI is running interactively and
 * whether ANSI colors should be emitted. All output modules consult these
 * helpers — no module inspects process.stdout / env vars directly.
 *
 * Resolution (read once at startup via detectMode, then frozen via setMode):
 *   stdout.isTTY && stderr.isTTY && !json   → interactive
 *   anything else                            → non-interactive
 *   CI=true                                  → forces non-interactive
 *   --no-color or NO_COLOR=1                 → disables ANSI even if interactive
 *   FORCE_COLOR                              → forces ANSI on regardless
 *
 * Direct ansis usage outside theme.ts is governed by env vars set by
 * early-env.ts (which runs before ansis loads). Theme tokens additionally
 * gate on useColor() at call time, so post-load flag updates also apply.
 */

export interface OutputMode {
	interactive: boolean;
	color: boolean;
	json: boolean;
	verbose: boolean;
}

export interface DetectModeOptions {
	json?: boolean;
	noColor?: boolean;
	forceColor?: boolean;
	verbose?: boolean;
}

let mode: OutputMode | null = null;
let lockedColorChoice: { noColor?: boolean; forceColor?: boolean } = {};

function isTruthyEnv(v: string | undefined): boolean {
	if (!v) return false;
	const lower = v.toLowerCase();
	return lower !== "0" && lower !== "false" && lower !== "";
}

export function detectMode(opts: DetectModeOptions = {}): OutputMode {
	const json = !!opts.json;
	const verbose = !!opts.verbose;
	const stdoutTty = !!(process.stdout.isTTY ?? false);
	const stderrTty = !!(process.stderr.isTTY ?? false);
	const ci = isTruthyEnv(process.env.CI);

	const interactive = !json && !ci && stdoutTty && stderrTty;

	// Color choices passed once (typically by cli.ts at startup) are remembered,
	// so subsequent re-detections (e.g. logger.configure after commander parses)
	// don't forget about --no-color / --force-color flags from argv.
	if (opts.noColor !== undefined) lockedColorChoice.noColor = opts.noColor;
	if (opts.forceColor !== undefined) lockedColorChoice.forceColor = opts.forceColor;

	const noColorEnv = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "";
	const forceColor = !!lockedColorChoice.forceColor || isTruthyEnv(process.env.FORCE_COLOR);
	const noColorFlag = !!lockedColorChoice.noColor;

	let color: boolean;
	if (forceColor) color = true;
	else if (noColorFlag || noColorEnv || json) color = false;
	else color = stderrTty || stdoutTty;

	return { interactive, color, json, verbose };
}

export function setMode(m: OutputMode): void {
	mode = m;
}

export function getMode(): OutputMode {
	if (!mode) mode = detectMode();
	return mode;
}

export function useColor(): boolean {
	return getMode().color;
}

export function isInteractive(): boolean {
	return getMode().interactive;
}

export function useSpinner(): boolean {
	return getMode().interactive && !getMode().verbose;
}

export function isJson(): boolean {
	return getMode().json;
}

export function isVerbose(): boolean {
	return getMode().verbose;
}

/** Test helper: clear cached mode so the next getMode() re-detects. */
export function resetMode(): void {
	mode = null;
	lockedColorChoice = {};
}
