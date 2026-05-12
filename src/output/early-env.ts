/**
 * Early env munging — MUST be imported FIRST in src/cli.ts, before any other
 * module that pulls in ansis (transitively or directly). ansis decides its
 * color level at module load by inspecting NO_COLOR / FORCE_COLOR / TTY, and
 * the decision cannot be changed afterwards. So we translate --no-color /
 * --json / --force-color command-line flags into env vars here, before ansis
 * loads.
 */

const argv = process.argv.slice(2);
const hasFlag = (flag: string): boolean => argv.includes(flag);
const hasFlagOr = (flags: readonly string[]): boolean => flags.some((f) => argv.includes(f));

if (hasFlag("--no-color") || hasFlagOr(["--json", "-j"])) {
	// Setting NO_COLOR to any non-empty string disables ansis colors.
	// (We do not touch NO_COLOR if it was already set externally.)
	if (!process.env.NO_COLOR || process.env.NO_COLOR === "") {
		process.env.NO_COLOR = "1";
	}
}

if (hasFlag("--force-color")) {
	if (!process.env.FORCE_COLOR || process.env.FORCE_COLOR === "") {
		process.env.FORCE_COLOR = "1";
	}
}
