import { describe, test, expect } from "bun:test";
import { formatCallResult } from "../../src/output/formatter.ts";

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
