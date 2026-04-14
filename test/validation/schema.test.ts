import { describe, expect, test } from "bun:test";
import type { Tool } from "../../src/config/schemas.ts";
import { validateToolInput } from "../../src/validation/schema.ts";

function makeTool(name: string, inputSchema: Record<string, unknown>): Tool {
	return {
		name,
		description: "A test tool",
		inputSchema: inputSchema as Tool["inputSchema"],
	};
}

describe("validateToolInput", () => {
	test("passes valid input", () => {
		const tool = makeTool("valid_input", {
			type: "object",
			properties: { name: { type: "string" } },
			required: ["name"],
		});
		const result = validateToolInput("s", tool, { name: "hello" });
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	test("catches missing required field", () => {
		const tool = makeTool("missing_required", {
			type: "object",
			properties: { name: { type: "string" }, age: { type: "number" } },
			required: ["name", "age"],
		});
		const result = validateToolInput("s", tool, { name: "hello" });
		expect(result.valid).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]?.message).toContain("age");
	});

	test("catches wrong type", () => {
		const tool = makeTool("wrong_type", {
			type: "object",
			properties: { count: { type: "number" } },
		});
		const result = validateToolInput("s", tool, { count: "not a number" });
		expect(result.valid).toBe(false);
		expect(result.errors[0]?.message).toContain("number");
	});

	test("catches invalid enum value", () => {
		const tool = makeTool("bad_enum", {
			type: "object",
			properties: { color: { type: "string", enum: ["red", "blue", "green"] } },
		});
		const result = validateToolInput("s", tool, { color: "purple" });
		expect(result.valid).toBe(false);
		expect(result.errors[0]?.message).toContain("one of");
	});

	test("validates nested objects", () => {
		const tool = makeTool("nested", {
			type: "object",
			properties: {
				user: {
					type: "object",
					properties: { email: { type: "string" } },
					required: ["email"],
				},
			},
		});
		const result = validateToolInput("s", tool, { user: {} });
		expect(result.valid).toBe(false);
		expect(result.errors[0]?.message).toContain("email");
	});

	test("passes when no schema properties defined", () => {
		const tool = makeTool("no_props", { type: "object" });
		const result = validateToolInput("s", tool, { anything: "goes" });
		expect(result.valid).toBe(true);
	});

	test("passes with empty input and no required fields", () => {
		const tool = makeTool("optional_only", {
			type: "object",
			properties: { optional: { type: "string" } },
		});
		const result = validateToolInput("s", tool, {});
		expect(result.valid).toBe(true);
	});

	test("reports multiple errors", () => {
		const tool = makeTool("multi_error", {
			type: "object",
			properties: {
				name: { type: "string" },
				age: { type: "number" },
			},
			required: ["name", "age"],
		});
		const result = validateToolInput("s", tool, {});
		expect(result.valid).toBe(false);
		expect(result.errors.length).toBe(2);
	});

	test("returns invalid when schema compilation fails", () => {
		const tool = makeTool("bad_schema", {
			type: "object",
			properties: { x: { type: "string" } },
			// Invalid: $ref with other keywords in strict AJV contexts can fail,
			// but a more reliable way to trigger compile failure is an invalid type
			patternProperties: { "^x": { type: "invalid_type_that_breaks" } },
			additionalProperties: { $ref: "#/definitions/nonexistent" },
		});
		const result = validateToolInput("bad_schema_server", tool, { x: "hello" });
		// Should not silently pass — must report as invalid
		expect(result.valid).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]?.path).toBe("(schema)");
		expect(result.errors[0]?.message).toContain("schema compilation failed");
	});

	test("caches compiled validators", () => {
		const tool = makeTool("cached_tool", {
			type: "object",
			properties: { x: { type: "string" } },
			required: ["x"],
		});
		// Call twice — second should use cache
		validateToolInput("cache_test", tool, { x: "a" });
		const result = validateToolInput("cache_test", tool, {});
		expect(result.valid).toBe(false);
	});
});
