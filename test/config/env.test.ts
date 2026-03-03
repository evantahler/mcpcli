import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { interpolateEnvString, interpolateEnv } from "../../src/config/env.ts";

describe("interpolateEnvString", () => {
  beforeEach(() => {
    process.env.TEST_VAR = "hello";
    process.env.TEST_VAR2 = "world";
  });

  afterEach(() => {
    delete process.env.TEST_VAR;
    delete process.env.TEST_VAR2;
    delete process.env.MCP_STRICT_ENV;
  });

  test("replaces ${VAR} with env value", () => {
    expect(interpolateEnvString("${TEST_VAR}")).toBe("hello");
  });

  test("replaces multiple vars in one string", () => {
    expect(interpolateEnvString("${TEST_VAR} ${TEST_VAR2}")).toBe("hello world");
  });

  test("leaves strings without vars untouched", () => {
    expect(interpolateEnvString("no vars here")).toBe("no vars here");
  });

  test("throws on missing var in strict mode", () => {
    expect(() => interpolateEnvString("${DOES_NOT_EXIST}")).toThrow("DOES_NOT_EXIST");
  });

  test("warns and returns empty on missing var in non-strict mode", () => {
    process.env.MCP_STRICT_ENV = "false";
    expect(interpolateEnvString("prefix-${DOES_NOT_EXIST}-suffix")).toBe("prefix--suffix");
  });
});

describe("interpolateEnv", () => {
  beforeEach(() => {
    process.env.TEST_KEY = "val";
  });

  afterEach(() => {
    delete process.env.TEST_KEY;
  });

  test("interpolates strings in objects recursively", () => {
    const input = { a: "${TEST_KEY}", b: { c: "x-${TEST_KEY}-y" } };
    expect(interpolateEnv(input)).toEqual({ a: "val", b: { c: "x-val-y" } });
  });

  test("interpolates strings in arrays", () => {
    const input = ["${TEST_KEY}", "plain"];
    expect(interpolateEnv(input)).toEqual(["val", "plain"]);
  });

  test("passes through non-string values", () => {
    const input = { a: 42, b: true, c: null };
    expect(interpolateEnv(input)).toEqual({ a: 42, b: true, c: null });
  });
});
