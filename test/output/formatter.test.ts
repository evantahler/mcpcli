import { describe, test, expect } from "bun:test";
import ansis from "ansis";
import { formatCallResult, wrapDescription } from "../../src/output/formatter.ts";

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
      expect(lines[i].startsWith(" ".repeat(10))).toBe(true);
    }
  });

  test("does not break mid-word for long words", () => {
    const longWord = "superlongwordthatcannotbreak";
    const result = strip(wrapDescription(longWord, 10, 25));
    expect(result.trim()).toBe(longWord);
  });

  test("skips wrapping when available width is too narrow", () => {
    const text = "some description text here";
    const result = strip(wrapDescription(text, 70, 80));
    // available = 10, which is < 20, so no wrapping
    expect(result).toBe(text);
    expect(result.includes("\n")).toBe(false);
  });

  test("handles empty text", () => {
    const result = strip(wrapDescription("", 10, 80));
    expect(result).toBe("");
  });
});
