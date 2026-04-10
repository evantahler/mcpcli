import { describe, test, expect } from "bun:test";
import ansis from "ansis";
import {
  formatCallResult,
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

describe("formatCallResult with format: text", () => {
  const opts = { format: "text" as const };

  test("extracts plain text from content blocks", () => {
    const result = {
      content: [{ type: "text", text: "hello world" }],
    };
    expect(formatCallResult(result, opts)).toBe("hello world");
  });

  test("pretty-prints JSON text content", () => {
    const result = {
      content: [{ type: "text", text: '{"name":"Evan","count":42}' }],
    };
    const output = formatCallResult(result, opts);
    expect(JSON.parse(output)).toEqual({ name: "Evan", count: 42 });
    // Should be pretty-printed with indentation
    expect(output).toContain("\n");
  });

  test("joins multiple text blocks with newlines", () => {
    const result = {
      content: [
        { type: "text", text: "line one" },
        { type: "text", text: "line two" },
      ],
    };
    expect(formatCallResult(result, opts)).toBe("line one\nline two");
  });

  test("shows placeholder for image content", () => {
    const result = {
      content: [{ type: "image", mimeType: "image/png", data: "AAAA" }],
    };
    expect(formatCallResult(result, opts)).toContain("[image: image/png,");
  });

  test("shows placeholder for resource content", () => {
    const result = {
      content: [{ type: "resource", uri: "file:///hello.txt" }],
    };
    expect(formatCallResult(result, opts)).toBe("[resource: file:///hello.txt]");
  });

  test("prefixes error results with error:", () => {
    const result = {
      content: [{ type: "text", text: "something went wrong" }],
      isError: true,
    };
    expect(formatCallResult(result, opts)).toBe("error: something went wrong");
  });

  test("falls back to JSON for non-standard result shapes", () => {
    const result = { unexpected: "data" };
    const output = formatCallResult(result, opts);
    expect(JSON.parse(output)).toEqual({ unexpected: "data" });
  });

  test("handles empty content array", () => {
    const result = { content: [] };
    const output = formatCallResult(result, opts);
    expect(JSON.parse(output)).toEqual({ content: [] });
  });

  test("handles unknown content types", () => {
    const result = {
      content: [{ type: "custom_widget" }],
    };
    expect(formatCallResult(result, opts)).toBe("[custom_widget]");
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
      expect(lines[i].startsWith(" ".repeat(10))).toBe(true);
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
