import { describe, expect, test } from "bun:test";
import ansis from "ansis";
import {
	formatCallResult,
	jsonToMarkdown,
	renderMarkdownToAnsi,
	wrapDescription,
} from "../../src/output/formatter.ts";

describe("formatCallResult nested JSON parsing", () => {
	test("parses JSON strings inside text content", () => {
		const result = {
			content: [{ type: "text", text: '{"name":"Evan","count":42}' }],
		};
		const parsed = JSON.parse(formatCallResult(result, {}));
		expect(parsed.content[0].text).toEqual({ name: "Evan", count: 42 });
	});

	test("leaves plain strings as-is", () => {
		const result = {
			content: [{ type: "text", text: "hello world" }],
		};
		const parsed = JSON.parse(formatCallResult(result, {}));
		expect(parsed.content[0].text).toBe("hello world");
	});

	test("parses nested JSON arrays", () => {
		const result = {
			content: [{ type: "text", text: "[1, 2, 3]" }],
		};
		const parsed = JSON.parse(formatCallResult(result, {}));
		expect(parsed.content[0].text).toEqual([1, 2, 3]);
	});

	test("parses numeric strings", () => {
		const result = {
			content: [{ type: "text", text: "42" }],
		};
		const parsed = JSON.parse(formatCallResult(result, {}));
		expect(parsed.content[0].text).toBe(42);
	});

	test("handles deeply nested JSON strings", () => {
		const inner = JSON.stringify({ nested: true });
		const result = {
			content: [{ type: "text", text: inner }],
		};
		const parsed = JSON.parse(formatCallResult(result, {}));
		expect(parsed.content[0].text).toEqual({ nested: true });
	});

	test("preserves non-string values unchanged", () => {
		const result = {
			content: [{ type: "text", text: "plain" }],
			isError: false,
		};
		const parsed = JSON.parse(formatCallResult(result, {}));
		expect(parsed.isError).toBe(false);
	});
});

describe("formatCallResult with format: markdown", () => {
	const opts = { format: "markdown" as const };

	test("renders plain text through markdown", () => {
		const result = {
			content: [{ type: "text", text: "hello world" }],
		};
		const output = formatCallResult(result, opts);
		// Should contain the text (possibly with ANSI codes and trailing whitespace)
		expect(ansis.strip(output).trim()).toContain("hello world");
	});

	test("renders bold/italic markdown content", () => {
		const result = {
			content: [{ type: "text", text: "**bold** and *italic*" }],
		};
		const output = formatCallResult(result, opts);
		const stripped = ansis.strip(output);
		expect(stripped).toContain("bold");
		expect(stripped).toContain("italic");
	});

	test("renders headings with bold styling", () => {
		const result = {
			content: [{ type: "text", text: "# Title\n\nBody text" }],
		};
		const output = formatCallResult(result, opts);
		const stripped = ansis.strip(output);
		expect(stripped).toContain("Title");
		expect(stripped).toContain("Body text");
	});

	test("renders code blocks with borders", () => {
		const result = {
			content: [{ type: "text", text: "```js\nconsole.log(42)\n```" }],
		};
		const output = formatCallResult(result, opts);
		const stripped = ansis.strip(output);
		expect(stripped).toContain("console.log(42)");
		expect(stripped).toContain("│");
	});

	test("renders JSON content as a structured markdown document", () => {
		const result = {
			content: [{ type: "text", text: '{"name":"Evan","active":true}' }],
		};
		const output = formatCallResult(result, opts);
		const stripped = ansis.strip(output);
		// Keys become headings, values become text
		expect(stripped).toContain("Name");
		expect(stripped).toContain("Evan");
		expect(stripped).toContain("Active");
		expect(stripped).toContain("true");
	});
});

describe("jsonToMarkdown", () => {
	test("renders primitive values as plain text", () => {
		expect(jsonToMarkdown("hello")).toBe("hello");
		expect(jsonToMarkdown(42)).toBe("42");
		expect(jsonToMarkdown(true)).toBe("true");
		expect(jsonToMarkdown(null)).toBe("null");
	});

	test("renders flat object with keys as h1 headings", () => {
		const md = jsonToMarkdown({ display_name: "Evan", active: true });
		expect(md).toContain("# Display Name\n\nEvan");
		expect(md).toContain("# Active\n\ntrue");
	});

	test("humanizes key names", () => {
		const md = jsonToMarkdown({ my_email_address: "a@b.com", firstName: "Evan" });
		expect(md).toContain("# My Email Address");
		expect(md).toContain("# First Name");
	});

	test("renders nested objects with increasing heading depth", () => {
		const md = jsonToMarkdown({ user: { name: "Evan", role: "admin" } });
		expect(md).toContain("# User");
		expect(md).toContain("## Name\n\nEvan");
		expect(md).toContain("## Role\n\nadmin");
	});

	test("renders arrays of primitives as bullet lists", () => {
		const md = jsonToMarkdown({ tags: ["a", "b", "c"] });
		expect(md).toContain("# Tags");
		expect(md).toContain("- a\n- b\n- c");
	});

	test("renders arrays of objects with numbered sub-sections and labels", () => {
		const md = jsonToMarkdown({
			teams: [
				{ name: "Engineering", key: "ENG" },
				{ name: "Product", key: "PRO" },
			],
		});
		expect(md).toContain("# Teams");
		expect(md).toContain("## 1. Engineering");
		expect(md).toContain("- **Key:** ENG");
		expect(md).toContain("## 2. Product");
		expect(md).toContain("- **Key:** PRO");
		// Name is used as the label, so it should not appear as a separate bullet
		expect(md).not.toContain("- **Name:**");
	});

	test("falls back to numeric labels when no label key exists", () => {
		const md = jsonToMarkdown({
			items: [
				{ count: 10, active: true },
				{ count: 20, active: false },
			],
		});
		expect(md).toContain("## 1");
		expect(md).toContain("## 2");
		expect(md).not.toContain("## 1.");
	});

	test("uses bullet lists at depth 3+", () => {
		const deep = { a: { b: { c: { d: { e: { f: { g: "deep" } } } } } } };
		const md = jsonToMarkdown(deep);
		expect(md).toContain("# A");
		expect(md).toContain("## B");
		// depth 3+ uses bullets instead of headings
		expect(md).toContain("- **C:**");
		expect(md).toContain("- **G:** deep");
		expect(md).not.toContain("###");
	});

	test("renders nested arrays within bullets compactly", () => {
		const md = jsonToMarkdown({
			team: {
				name: "Engineering",
				members: [
					{ name: "Alice", email: "alice@co.com" },
					{ name: "Bob", email: "bob@co.com" },
				],
			},
		});
		expect(md).toContain("# Team");
		expect(md).toContain("## Name");
		expect(md).toContain("## Members");
		// Members rendered as bullets with labels
		expect(md).toContain("- Alice");
		expect(md).toContain("- Bob");
		expect(md).toContain("- **Email:** alice@co.com");
	});

	test("finds labels with different key casings", () => {
		const md = jsonToMarkdown({
			users: [
				{ display_name: "Evan", id: "1" },
				{ displayName: "Nate", id: "2" },
			],
		});
		expect(md).toContain("## 1. Evan");
		expect(md).toContain("## 2. Nate");
	});
});

describe("formatCallResult with format: json (explicit)", () => {
	test("behaves identically to default", () => {
		const result = {
			content: [{ type: "text", text: '{"name":"Evan"}' }],
		};
		const defaultOutput = formatCallResult(result, {});
		const jsonOutput = formatCallResult(result, { format: "json" });
		expect(jsonOutput).toBe(defaultOutput);
	});
});

describe("renderMarkdownToAnsi", () => {
	test("renders basic markdown preserving text", () => {
		const output = renderMarkdownToAnsi("**hello** world");
		const stripped = ansis.strip(output);
		expect(stripped).toContain("hello");
		expect(stripped).toContain("world");
	});

	test("renders lists with bullet markers", () => {
		const output = renderMarkdownToAnsi("- item 1\n- item 2");
		const stripped = ansis.strip(output);
		expect(stripped).toContain("item 1");
		expect(stripped).toContain("item 2");
		expect(stripped).toContain("•");
	});

	test("renders inline code", () => {
		const output = renderMarkdownToAnsi("use `foo()` here");
		const stripped = ansis.strip(output);
		expect(stripped).toContain("foo()");
	});

	test("renders code blocks with border characters", () => {
		const output = renderMarkdownToAnsi("```js\nconst x = 1;\n```");
		const stripped = ansis.strip(output);
		expect(stripped).toContain("const x = 1;");
		expect(stripped).toContain("│");
	});

	test("renders blockquotes with border", () => {
		const output = renderMarkdownToAnsi("> quoted text");
		const stripped = ansis.strip(output);
		expect(stripped).toContain("quoted text");
		expect(stripped).toContain("│");
	});

	test("renders headings", () => {
		const output = renderMarkdownToAnsi("# Title\n\nBody");
		const stripped = ansis.strip(output);
		expect(stripped).toContain("Title");
		expect(stripped).toContain("Body");
		// H1 should have rule underline
		expect(stripped).toContain("═");
	});

	test("renders links with href", () => {
		const output = renderMarkdownToAnsi("[click](https://example.com)");
		const stripped = ansis.strip(output);
		expect(stripped).toContain("click");
		expect(stripped).toContain("https://example.com");
	});
});

describe("wrapDescription", () => {
	// Helper to strip ANSI codes for easier assertions
	const strip = (s: string) => ansis.strip(s);

	test("returns single line when text fits", () => {
		const result = strip(wrapDescription("short text", 10, 80));
		expect(result).toBe("short text");
	});

	test("wraps long text to multiple lines", () => {
		const result = strip(wrapDescription("one two three four five six", 10, 35));
		// available = 35 - 10 = 25 chars
		const lines = result.split("\n");
		expect(lines.length).toBeGreaterThan(1);
		// Each line (trimmed) should not exceed 25 visible chars
		for (const line of lines) {
			expect(line.trimStart().length).toBeLessThanOrEqual(25);
		}
	});

	test("indents continuation lines to prefix width", () => {
		const result = wrapDescription("one two three four five six", 10, 30);
		const lines = strip(result).split("\n");
		// available = 20, should wrap
		expect(lines.length).toBeGreaterThan(1);
		// Continuation lines should start with 10 spaces
		for (let i = 1; i < lines.length; i++) {
			expect(lines[i]!.startsWith(" ".repeat(10))).toBe(true);
		}
	});

	test("hard-breaks words longer than available width", () => {
		const longWord = "abcdefghijklmnopqrstuvwxyz0123456789";
		const result = strip(wrapDescription(longWord, 10, 30));
		// available = 20, word is 36 chars, should be broken into chunks of 20
		const lines = result.split("\n");
		expect(lines.length).toBe(2);
		for (const line of lines) {
			expect(line.trimStart().length).toBeLessThanOrEqual(20);
		}
	});

	test("wraps onto next line with small indent when available < 20", () => {
		const text = "some description text here";
		const result = strip(wrapDescription(text, 70, 80));
		// available = 10, which is < 20, so wraps onto next line with small indent
		const lines = result.split("\n").filter((l) => l.length > 0);
		expect(lines.length).toBeGreaterThan(0);
		// Each line should fit within termWidth (80)
		for (const line of lines) {
			expect(line.length).toBeLessThanOrEqual(80);
		}
	});

	test("no output line exceeds termWidth", () => {
		const text =
			"Send a message to a Channel, Direct Message (IM/DM), or Multi-Person (MPIM) conversation. Can send top-level messages or reply to an existing thread.";
		const termWidth = 80;
		const prefixWidth = 45;
		const result = strip(wrapDescription(text, prefixWidth, termWidth));
		const lines = result.split("\n");
		for (const line of lines) {
			expect(line.length).toBeLessThanOrEqual(termWidth);
		}
	});

	test("truncates when terminal is truly tiny", () => {
		const text = "some long description text here";
		// termWidth=30, prefixWidth=25 → available=5 < 20, fallbackAvail=30-4=26 >= 20
		// Should still wrap, not truncate
		const result = strip(wrapDescription(text, 25, 30));
		const lines = result.split("\n").filter((l) => l.length > 0);
		for (const line of lines) {
			expect(line.length).toBeLessThanOrEqual(30);
		}
	});

	test("handles empty text", () => {
		const result = strip(wrapDescription("", 10, 80));
		expect(result).toBe("");
	});
});
