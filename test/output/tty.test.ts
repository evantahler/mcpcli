import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { detectMode, resetMode, setMode, useColor } from "../../src/output/tty.ts";

describe("tty.detectMode", () => {
	let savedEnv: Record<string, string | undefined>;
	let savedStdoutTTY: boolean | undefined;
	let savedStderrTTY: boolean | undefined;

	beforeEach(() => {
		savedEnv = {
			CI: process.env.CI,
			NO_COLOR: process.env.NO_COLOR,
			FORCE_COLOR: process.env.FORCE_COLOR,
		};
		delete process.env.CI;
		delete process.env.NO_COLOR;
		delete process.env.FORCE_COLOR;
		savedStdoutTTY = process.stdout.isTTY;
		savedStderrTTY = process.stderr.isTTY;
		Object.defineProperty(process.stdout, "isTTY", { value: true, writable: true });
		Object.defineProperty(process.stderr, "isTTY", { value: true, writable: true });
		resetMode();
	});

	afterEach(() => {
		for (const [k, v] of Object.entries(savedEnv)) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
		Object.defineProperty(process.stdout, "isTTY", { value: savedStdoutTTY, writable: true });
		Object.defineProperty(process.stderr, "isTTY", { value: savedStderrTTY, writable: true });
		resetMode();
	});

	test("interactive when both streams are TTY and not json", () => {
		const m = detectMode({});
		expect(m.interactive).toBe(true);
		expect(m.color).toBe(true);
	});

	test("json forces non-interactive and no color", () => {
		const m = detectMode({ json: true });
		expect(m.interactive).toBe(false);
		expect(m.color).toBe(false);
	});

	test("CI=true forces non-interactive", () => {
		process.env.CI = "true";
		const m = detectMode({});
		expect(m.interactive).toBe(false);
	});

	test("NO_COLOR disables color even when interactive", () => {
		process.env.NO_COLOR = "1";
		const m = detectMode({});
		expect(m.interactive).toBe(true);
		expect(m.color).toBe(false);
	});

	test("--no-color flag disables color", () => {
		const m = detectMode({ noColor: true });
		expect(m.color).toBe(false);
	});

	test("FORCE_COLOR overrides NO_COLOR", () => {
		process.env.NO_COLOR = "1";
		process.env.FORCE_COLOR = "1";
		const m = detectMode({});
		expect(m.color).toBe(true);
	});

	test("--force-color flag overrides --no-color flag", () => {
		const m = detectMode({ noColor: true, forceColor: true });
		expect(m.color).toBe(true);
	});

	test("non-TTY stderr disables color unless forced", () => {
		Object.defineProperty(process.stderr, "isTTY", { value: false, writable: true });
		Object.defineProperty(process.stdout, "isTTY", { value: false, writable: true });
		const m = detectMode({});
		expect(m.color).toBe(false);
	});

	test("noColor flag is remembered across re-detection", () => {
		detectMode({ noColor: true });
		// Second call without passing noColor should still honor the remembered choice
		const m2 = detectMode({ json: false, verbose: true });
		expect(m2.color).toBe(false);
	});

	test("setMode + useColor reflect the resolved color decision", () => {
		setMode({ interactive: true, color: false, json: false, verbose: false });
		expect(useColor()).toBe(false);
		setMode({ interactive: true, color: true, json: false, verbose: false });
		expect(useColor()).toBe(true);
	});
});
