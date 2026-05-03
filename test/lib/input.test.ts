import { describe, expect, test } from "bun:test";
import { parseShellArgs } from "../../src/lib/input.ts";

const echoSchema = {
	type: "object",
	properties: {
		message: { type: "string" },
	},
	required: ["message"],
};

const addSchema = {
	type: "object",
	properties: {
		a: { type: "number" },
		b: { type: "integer" },
	},
	required: ["a", "b"],
};

const flagsSchema = {
	type: "object",
	properties: {
		enabled: { type: "boolean" },
		labels: { type: "array", items: { type: "string" } },
		counts: { type: "array", items: { type: "integer" } },
	},
};

describe("parseShellArgs", () => {
	test("parses --key value form", () => {
		expect(parseShellArgs(["--message", "hello"], echoSchema)).toEqual({ message: "hello" });
	});

	test("parses --key=value form", () => {
		expect(parseShellArgs(["--message=hello world"], echoSchema)).toEqual({ message: "hello world" });
	});

	test("coerces integers", () => {
		expect(parseShellArgs(["--b", "42"], addSchema)).toEqual({ b: 42 });
	});

	test("coerces numbers (floats)", () => {
		expect(parseShellArgs(["--a", "3.14"], addSchema)).toEqual({ a: 3.14 });
	});

	test("rejects non-numeric for integer fields", () => {
		expect(() => parseShellArgs(["--b", "foo"], addSchema)).toThrow(/expected integer/);
	});

	test("rejects non-numeric for number fields", () => {
		expect(() => parseShellArgs(["--a", "foo"], addSchema)).toThrow(/expected number/);
	});

	test("boolean: --flag means true", () => {
		expect(parseShellArgs(["--enabled"], flagsSchema)).toEqual({ enabled: true });
	});

	test("boolean: --no-flag means false", () => {
		expect(parseShellArgs(["--no-enabled"], flagsSchema)).toEqual({ enabled: false });
	});

	test("boolean: --flag true", () => {
		expect(parseShellArgs(["--enabled", "true"], flagsSchema)).toEqual({ enabled: true });
	});

	test("boolean: --flag false", () => {
		expect(parseShellArgs(["--enabled", "false"], flagsSchema)).toEqual({ enabled: false });
	});

	test("boolean: --flag=1", () => {
		expect(parseShellArgs(["--enabled=1"], flagsSchema)).toEqual({ enabled: true });
	});

	test("boolean: rejects garbage", () => {
		expect(() => parseShellArgs(["--enabled", "maybe"], flagsSchema)).toThrow(/expected boolean/);
	});

	test("array: repeatable flags", () => {
		expect(parseShellArgs(["--labels", "bug", "--labels", "todo"], flagsSchema)).toEqual({
			labels: ["bug", "todo"],
		});
	});

	test("array: comma-separated", () => {
		expect(parseShellArgs(["--labels", "bug,todo"], flagsSchema)).toEqual({ labels: ["bug", "todo"] });
	});

	test("array: mixed repeatable and comma-separated", () => {
		expect(parseShellArgs(["--labels", "bug,todo", "--labels", "feature"], flagsSchema)).toEqual({
			labels: ["bug", "todo", "feature"],
		});
	});

	test("array: integer items get coerced", () => {
		expect(parseShellArgs(["--counts", "1,2", "--counts", "3"], flagsSchema)).toEqual({
			counts: [1, 2, 3],
		});
	});

	test("rejects bare positional", () => {
		expect(() => parseShellArgs(["foo"], echoSchema)).toThrow(/unexpected positional/);
	});

	test("rejects duplicate scalar flag", () => {
		expect(() => parseShellArgs(["--message", "a", "--message", "b"], echoSchema)).toThrow(/more than once/);
	});

	test("scalar flag with no value errors", () => {
		expect(() => parseShellArgs(["--message"], echoSchema)).toThrow(/expected value/);
	});

	test("scalar flag followed by another flag errors", () => {
		expect(() => parseShellArgs(["--message", "--other", "x"], echoSchema)).toThrow(/expected value/);
	});

	test("missing schema: keeps values as strings", () => {
		expect(parseShellArgs(["--anything", "hello"], undefined)).toEqual({ anything: "hello" });
	});

	test("unknown property: keeps as string (Ajv handles validation later)", () => {
		expect(parseShellArgs(["--bogus", "x"], echoSchema)).toEqual({ bogus: "x" });
	});

	test("--no-X is literal name when X is not a known boolean", () => {
		// `no-foo` isn't a boolean, so don't auto-negate; treat as a regular flag
		const schema = { type: "object", properties: { foo: { type: "string" } } };
		expect(parseShellArgs(["--no-foo", "value"], schema)).toEqual({ "no-foo": "value" });
	});

	test("rejects nested-object fields", () => {
		const schema = { type: "object", properties: { meta: { type: "object" } } };
		expect(() => parseShellArgs(["--meta", "x"], schema)).toThrow(/nested objects/);
	});

	test("returns empty object for empty token list", () => {
		expect(parseShellArgs([], echoSchema)).toEqual({});
	});
});
