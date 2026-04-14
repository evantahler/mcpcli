import { describe, expect, test } from "bun:test";
import { detectInstallMethod, isNewerVersion, needsCheck } from "../../src/update/checker.ts";

describe("isNewerVersion", () => {
	test("returns true when latest is newer (patch)", () => {
		expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
	});

	test("returns true when latest is newer (minor)", () => {
		expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
	});

	test("returns true when latest is newer (major)", () => {
		expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
	});

	test("returns false when versions are equal", () => {
		expect(isNewerVersion("1.2.3", "1.2.3")).toBe(false);
	});

	test("returns false when current is newer", () => {
		expect(isNewerVersion("2.0.0", "1.9.9")).toBe(false);
	});

	test("handles major version jump correctly", () => {
		expect(isNewerVersion("0.16.1", "1.0.0")).toBe(true);
	});

	test("handles minor version with lower patch", () => {
		expect(isNewerVersion("0.16.5", "0.17.0")).toBe(true);
	});
});

describe("needsCheck", () => {
	test("returns true when cache is undefined", () => {
		expect(needsCheck(undefined)).toBe(true);
	});

	test("returns true when cache has no lastCheckAt", () => {
		expect(needsCheck({ lastCheckAt: "", latestVersion: "1.0.0", hasUpdate: false })).toBe(true);
	});

	test("returns true when cache is older than 24 hours", () => {
		const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
		expect(needsCheck({ lastCheckAt: old, latestVersion: "1.0.0", hasUpdate: false })).toBe(true);
	});

	test("returns false when cache is fresh", () => {
		const recent = new Date(Date.now() - 1000).toISOString();
		expect(needsCheck({ lastCheckAt: recent, latestVersion: "1.0.0", hasUpdate: false })).toBe(
			false,
		);
	});
});

describe("detectInstallMethod", () => {
	test("returns a valid install method", () => {
		const method = detectInstallMethod();
		expect(["npm", "bun", "binary", "local-dev"]).toContain(method);
	});
});
