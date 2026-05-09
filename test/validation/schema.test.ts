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

	describe("array-with-sibling-enum normalization (issue #87)", () => {
		const orderByEnum = ["createdTime", "createdTime desc", "viewedByMeTime", "viewedByMeTime desc"];

		test("accepts array values that match a sibling primitive enum", () => {
			const tool = makeTool("sibling_enum_pass", {
				type: "object",
				properties: {
					order_by: {
						type: "array",
						items: { type: "string" },
						enum: orderByEnum,
					},
				},
			});
			const result = validateToolInput("s1", tool, { order_by: ["viewedByMeTime desc"] });
			expect(result.valid).toBe(true);
		});

		test("rejects entries that aren't in the (rewritten) item enum", () => {
			const tool = makeTool("sibling_enum_fail", {
				type: "object",
				properties: {
					order_by: {
						type: "array",
						items: { type: "string" },
						enum: orderByEnum,
					},
				},
			});
			const result = validateToolInput("s2", tool, { order_by: ["nope"] });
			expect(result.valid).toBe(false);
			expect(result.errors[0]?.path).toBe("order_by.0");
			expect(result.errors[0]?.message).toContain("one of");
		});

		test("does not regress correctly-shaped items.enum schemas", () => {
			const tool = makeTool("nested_enum_ok", {
				type: "object",
				properties: {
					order_by: {
						type: "array",
						items: { type: "string", enum: orderByEnum },
					},
				},
			});
			const pass = validateToolInput("s3", tool, { order_by: ["createdTime"] });
			expect(pass.valid).toBe(true);
			const fail = validateToolInput("s3", tool, { order_by: ["nope"] });
			expect(fail.valid).toBe(false);
		});

		test("leaves schema untouched when items.enum already exists", () => {
			const tool = makeTool("both_enums", {
				type: "object",
				properties: {
					order_by: {
						type: "array",
						items: { type: "string", enum: ["onlyA"] },
						enum: ["onlyB"],
					},
				},
			});
			// If we had rewritten the parent enum into items.enum we would have silently
			// overwritten the legitimate `["onlyA"]` constraint, and `["onlyB"]` would now pass.
			// Confirm we did not: items.enum still rejects "onlyB".
			const result = validateToolInput("s4", tool, { order_by: ["onlyB"] });
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.path === "order_by.0")).toBe(true);
		});

		test("leaves schema untouched when sibling enum contains non-primitives", () => {
			const tool = makeTool("non_primitive_enum", {
				type: "object",
				properties: {
					tuples: {
						type: "array",
						items: { type: "object" },
						enum: [{ a: 1 }, { b: 2 }],
					},
				},
			});
			// The original (malformed) Ajv behavior is preserved here: array value
			// is checked against the enum of objects and fails. We just verify we
			// didn't accidentally rewrite it.
			const result = validateToolInput("s5", tool, { tuples: [{ a: 1 }] });
			expect(result.valid).toBe(false);
		});
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
