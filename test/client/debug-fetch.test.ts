import { describe, expect, test } from "bun:test";
import { createDebugFetch, maskSensitive } from "../../src/client/debug-fetch.ts";

describe("maskSensitive", () => {
	test("masks Authorization header values", () => {
		const result = maskSensitive("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.test");
		expect(result).toBe("Bear...");
		expect(result).not.toContain("eyJ");
	});

	test("masks Cookie header values", () => {
		const result = maskSensitive("Cookie", "session=abc123def456ghi789");
		expect(result).toBe("sess...");
	});

	test("masks Set-Cookie header values", () => {
		const result = maskSensitive("Set-Cookie", "session=abc123def456ghi789");
		expect(result).toBe("sess...");
	});

	test("fully masks short sensitive values", () => {
		const result = maskSensitive("Authorization", "short");
		expect(result).toBe("***");
	});

	test("masks x-api-key header", () => {
		const result = maskSensitive("X-Api-Key", "sk-1234567890abcdef");
		expect(result).toBe("sk-1...");
	});

	test("masks api-key header", () => {
		const result = maskSensitive("Api-Key", "supersecretkey123");
		expect(result).toBe("supe...");
	});

	test("masks proxy-authorization header", () => {
		const result = maskSensitive("Proxy-Authorization", "Basic dXNlcjpwYXNz");
		expect(result).toBe("Basi...");
	});

	test("masks x-auth-token header", () => {
		const result = maskSensitive("X-Auth-Token", "tok_abc123xyz");
		expect(result).toBe("tok_...");
	});

	test("masks x-token header", () => {
		const result = maskSensitive("X-Token", "mytoken123");
		expect(result).toBe("myto...");
	});

	test("masks token header", () => {
		const result = maskSensitive("Token", "abcdefghij");
		expect(result).toBe("abcd...");
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
