import { describe, test, expect } from "bun:test";
import { createDebugFetch, maskSensitive } from "../../src/client/debug-fetch.ts";

describe("maskSensitive", () => {
  test("masks Authorization header values", () => {
    const result = maskSensitive("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.test");
    expect(result).toBe("Bearer eyJhb...");
    expect(result).not.toContain("test");
  });

  test("masks Cookie header values", () => {
    const result = maskSensitive("Cookie", "session=abc123def456ghi789");
    expect(result).toBe("session=abc1...");
  });

  test("masks Set-Cookie header values", () => {
    const result = maskSensitive("Set-Cookie", "session=abc123def456ghi789");
    expect(result).toBe("session=abc1...");
  });

  test("does not mask short values", () => {
    const result = maskSensitive("Authorization", "Bearer tok");
    expect(result).toBe("Bearer tok");
  });

  test("passes non-sensitive headers through unchanged", () => {
    expect(maskSensitive("Content-Type", "application/json")).toBe("application/json");
    expect(maskSensitive("X-Custom", "my-value")).toBe("my-value");
  });
});

describe("createDebugFetch", () => {
  test("returns a function", () => {
    const debugFetch = createDebugFetch(false);
    expect(typeof debugFetch).toBe("function");
  });
});
