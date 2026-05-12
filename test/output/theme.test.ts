import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import ansis from "ansis";
import { glyph, theme, underline } from "../../src/output/theme.ts";
import { resetMode, setMode } from "../../src/output/tty.ts";

function withColor(on: boolean): void {
	setMode({ interactive: true, color: on, json: false, verbose: false });
}

describe("theme tokens", () => {
	beforeEach(() => {
		resetMode();
	});
	afterEach(() => {
		resetMode();
	});

	test("theme.prompt renders magenta when color is enabled (and ansis supports it)", () => {
		withColor(true);
		const out = theme.prompt("hello");
		expect(ansis.strip(out)).toBe("hello");
		// We only assert the ANSI markers when ansis itself is emitting colors.
		// In some test envs ansis.isSupported() is false; in that case theme.prompt
		// passes through plain. We test the no-color path separately.
		if (ansis.isSupported()) {
			expect(out).toMatch(/35m|95m/); // magenta or brightMagenta
		}
	});

	test("theme.prompt renders plain when color is disabled", () => {
		withColor(false);
		expect(theme.prompt("hello")).toBe("hello");
	});

	test("theme.success/warn/error preserve visible text (color on)", () => {
		withColor(true);
		expect(ansis.strip(theme.success("ok"))).toBe("ok");
		expect(ansis.strip(theme.warn("careful"))).toBe("careful");
		expect(ansis.strip(theme.error("boom"))).toBe("boom");
	});

	test("theme.success/warn/error are plain when color is disabled", () => {
		withColor(false);
		expect(theme.success("ok")).toBe("ok");
		expect(theme.warn("careful")).toBe("careful");
		expect(theme.error("boom")).toBe("boom");
	});

	test("theme.url adds blue+underline ANSI when color is enabled", () => {
		withColor(true);
		const out = theme.url("https://example.com");
		expect(out).toContain("https://example.com");
		expect(out).toContain("\x1b[34m");
		expect(out).toContain("\x1b[4m");
	});

	test("theme.url returns plain when color is disabled", () => {
		withColor(false);
		expect(theme.url("https://example.com")).toBe("https://example.com");
	});

	test("theme.pillTool/Resource/Prompt include uppercased type label", () => {
		withColor(false);
		expect(theme.pillTool("tool")).toBe(" TOOL ");
		expect(theme.pillResource("resource")).toBe(" RESOURCE ");
		expect(theme.pillPrompt("prompt")).toBe(" PROMPT ");
	});

	test("glyph getters return plain glyphs when color is disabled", () => {
		withColor(false);
		expect(glyph.ok).toBe("✓");
		expect(glyph.fail).toBe("✗");
		expect(glyph.warn).toBe("⚠");
		expect(glyph.arrowOut).toBe("→");
		expect(glyph.arrowIn).toBe("←");
	});

	test("underline produces correct visible width of dashes", () => {
		withColor(false);
		expect(underline(5)).toBe("─────");
		expect(underline(0)).toBe("");
	});

	test("styleStackLine is a no-op when color is disabled", () => {
		withColor(false);
		const line = "    at myFn (/path/to/file.ts:12:34)";
		expect(theme.styleStackLine(line)).toBe(line);
	});

	test("styleStackLine preserves visible text for typical frames (color on)", () => {
		withColor(true);
		const styled = theme.styleStackLine("    at myFn (/path/to/file.ts:12:34)");
		expect(ansis.strip(styled)).toBe("    at myFn (/path/to/file.ts:12:34)");
	});

	test("styleStackLine passes through non-stack lines unchanged", () => {
		withColor(true);
		expect(theme.styleStackLine("just an error message")).toBe("just an error message");
	});
});
