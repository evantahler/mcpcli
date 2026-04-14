import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "../../src/cli.ts");

async function run(args: string[], cwd?: string) {
	const proc = Bun.spawn(["bun", "run", CLI, ...args], {
		stdout: "pipe",
		stderr: "pipe",
		cwd,
	});
	const exitCode = await proc.exited;
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	return { exitCode, stdout, stderr };
}

async function readSettings(dir: string, filename = "settings.local.json") {
	const path = join(dir, ".claude", filename);
	const content = await readFile(path, "utf-8");
	return JSON.parse(content);
}

async function readCursorSettings(dir: string, filename = "cli.json") {
	const path = join(dir, ".cursor", filename);
	const content = await readFile(path, "utf-8");
	return JSON.parse(content);
}

describe("mcpx allow", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "mcpx-allow-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true });
	});

	test("errors without arguments", async () => {
		const { exitCode, stderr } = await run(["allow"], tmpDir);
		expect(exitCode).not.toBe(0);
		expect(stderr).toContain("specify a server");
	});

	test("allows a server", async () => {
		const { exitCode } = await run(["allow", "github", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readSettings(tmpDir);
		expect(settings.permissions.allow).toContain("Bash(mcpx exec:github:*)");
		expect(settings.permissions.allow).toContain("Bash(mcpx allow:*)");
		expect(settings.permissions.allow).toContain("Bash(mcpx deny:*)");
	});

	test("allows specific tools", async () => {
		const { exitCode } = await run(["allow", "github", "search_repositories", "get_file", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readSettings(tmpDir);
		expect(settings.permissions.allow).toContain("Bash(mcpx exec:github:search_repositories:*)");
		expect(settings.permissions.allow).toContain("Bash(mcpx exec:github:get_file:*)");
		expect(settings.permissions.allow).not.toContain("Bash(mcpx exec:github:*)");
	});

	test("allows --all", async () => {
		const { exitCode } = await run(["allow", "--all", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readSettings(tmpDir);
		expect(settings.permissions.allow).toContain("Bash(mcpx exec:*)");
	});

	test("allows --all-read", async () => {
		const { exitCode } = await run(["allow", "--all-read", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readSettings(tmpDir);
		expect(settings.permissions.allow).toContain("Bash(mcpx search:*)");
		expect(settings.permissions.allow).toContain("Bash(mcpx info:*)");
		expect(settings.permissions.allow).toContain("Bash(mcpx servers:*)");
		expect(settings.permissions.allow).toContain("Bash(mcpx ping:*)");
		expect(settings.permissions.allow).toContain("Bash(mcpx resource:*)");
		expect(settings.permissions.allow).toContain("Bash(mcpx prompt:*)");
		expect(settings.permissions.allow).toContain("Bash(mcpx task:*)");
		expect(settings.permissions.allow).toContain("Bash(mcpx index:*)");
	});

	test("deduplicates patterns on repeated runs", async () => {
		await run(["allow", "github", "--json"], tmpDir);
		await run(["allow", "github", "--json"], tmpDir);

		const settings = await readSettings(tmpDir);
		const count = settings.permissions.allow.filter((p: string) => p === "Bash(mcpx exec:github:*)").length;
		expect(count).toBe(1);
	});

	test("preserves existing non-mcpx permissions", async () => {
		const claudeDir = join(tmpDir, ".claude");
		await mkdir(claudeDir, { recursive: true });
		await writeFile(
			join(claudeDir, "settings.local.json"),
			JSON.stringify({
				permissions: { allow: ["Bash(git:*)"] },
			}),
		);

		await run(["allow", "github", "--json"], tmpDir);

		const settings = await readSettings(tmpDir);
		expect(settings.permissions.allow).toContain("Bash(git:*)");
		expect(settings.permissions.allow).toContain("Bash(mcpx exec:github:*)");
	});

	test("dry-run does not write", async () => {
		const { exitCode, stdout } = await run(["allow", "github", "--dry-run", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const parsed = JSON.parse(stdout);
		expect(parsed.patterns).toContain("Bash(mcpx exec:github:*)");

		// File should not exist
		try {
			await readSettings(tmpDir);
			throw new Error("expected file to not exist");
		} catch (e: unknown) {
			if (e instanceof Error && e.message === "expected file to not exist") throw e;
			// Expected — file doesn't exist
		}
	});

	test("--list shows permissions as JSON", async () => {
		await run(["allow", "github", "--json"], tmpDir);
		const { exitCode, stdout } = await run(["allow", "--list", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const parsed = JSON.parse(stdout);
		expect(Array.isArray(parsed)).toBe(true);
		const local = parsed.find((r: { scope: string }) => r.scope === "local");
		expect(local.patterns).toContain("Bash(mcpx exec:github:*)");
	});

	test("writes to project scope with --project", async () => {
		const { exitCode } = await run(["allow", "github", "--project", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readSettings(tmpDir, "settings.json");
		expect(settings.permissions.allow).toContain("Bash(mcpx exec:github:*)");
	});
});

describe("mcpx deny", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "mcpx-deny-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true });
	});

	test("errors without arguments", async () => {
		const { exitCode, stderr } = await run(["deny"], tmpDir);
		expect(exitCode).not.toBe(0);
		expect(stderr).toContain("specify a server");
	});

	test("removes a server permission", async () => {
		await run(["allow", "github", "--json"], tmpDir);

		const settingsBefore = await readSettings(tmpDir);
		expect(settingsBefore.permissions.allow).toContain("Bash(mcpx exec:github:*)");

		const { exitCode } = await run(["deny", "github", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readSettings(tmpDir);
		expect(settings.permissions.allow).not.toContain("Bash(mcpx exec:github:*)");
	});

	test("removes specific tool permissions", async () => {
		await run(["allow", "github", "search_repositories", "get_file", "--json"], tmpDir);

		const { exitCode } = await run(["deny", "github", "search_repositories", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readSettings(tmpDir);
		expect(settings.permissions.allow).not.toContain("Bash(mcpx exec:github:search_repositories:*)");
		expect(settings.permissions.allow).toContain("Bash(mcpx exec:github:get_file:*)");
	});

	test("removes server and all its tool patterns", async () => {
		// Allow server-level + specific tools
		await run(["allow", "github", "--json"], tmpDir);
		await run(["allow", "github", "search_repositories", "--json"], tmpDir);

		const { exitCode } = await run(["deny", "github", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readSettings(tmpDir);
		const githubPatterns = settings.permissions.allow.filter((p: string) => p.includes("mcpx exec:github"));
		expect(githubPatterns.length).toBe(0);
	});

	test("--all removes all mcpx patterns", async () => {
		await run(["allow", "github", "--json"], tmpDir);
		await run(["allow", "--all-read", "--json"], tmpDir);

		const { exitCode } = await run(["deny", "--all", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readSettings(tmpDir);
		const mcpxPatterns = (settings.permissions.allow as string[]).filter((p) => p.startsWith("Bash(mcpx "));
		expect(mcpxPatterns.length).toBe(0);
	});

	test("--all-read removes read-only patterns", async () => {
		await run(["allow", "--all-read", "--json"], tmpDir);
		await run(["allow", "github", "--json"], tmpDir);

		const { exitCode } = await run(["deny", "--all-read", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readSettings(tmpDir);
		expect(settings.permissions.allow).not.toContain("Bash(mcpx search:*)");
		// exec permission should still be there
		expect(settings.permissions.allow).toContain("Bash(mcpx exec:github:*)");
	});

	test("preserves non-mcpx permissions", async () => {
		const claudeDir = join(tmpDir, ".claude");
		await mkdir(claudeDir, { recursive: true });
		await writeFile(
			join(claudeDir, "settings.local.json"),
			JSON.stringify({
				permissions: { allow: ["Bash(git:*)", "Bash(mcpx exec:github:*)"] },
			}),
		);

		await run(["deny", "--all", "--json"], tmpDir);

		const settings = await readSettings(tmpDir);
		expect(settings.permissions.allow).toContain("Bash(git:*)");
		expect(settings.permissions.allow).not.toContain("Bash(mcpx exec:github:*)");
	});

	test("dry-run does not write", async () => {
		await run(["allow", "github", "--json"], tmpDir);

		const { exitCode, stdout } = await run(["deny", "github", "--dry-run", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const parsed = JSON.parse(stdout);
		expect(parsed.wouldRemove.length).toBeGreaterThan(0);

		// Permission should still be there
		const settings = await readSettings(tmpDir);
		expect(settings.permissions.allow).toContain("Bash(mcpx exec:github:*)");
	});

	test("reports no changes when nothing matches", async () => {
		await run(["allow", "github", "--json"], tmpDir);
		const { exitCode, stdout } = await run(["deny", "linear", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const parsed = JSON.parse(stdout);
		expect(parsed.removed.length).toBe(0);
	});
});

describe("mcpx allow --cursor", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "mcpx-allow-cursor-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true });
	});

	test("allows a server", async () => {
		const { exitCode } = await run(["allow", "github", "--cursor", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readCursorSettings(tmpDir);
		expect(settings.permissions.allow).toContain("Shell(mcpx exec:github:*)");
		expect(settings.permissions.allow).toContain("Shell(mcpx allow:*)");
		expect(settings.permissions.allow).toContain("Shell(mcpx deny:*)");
	});

	test("allows specific tools", async () => {
		const { exitCode } = await run(
			["allow", "github", "search_repositories", "get_file", "--cursor", "--json"],
			tmpDir,
		);
		expect(exitCode).toBe(0);

		const settings = await readCursorSettings(tmpDir);
		expect(settings.permissions.allow).toContain("Shell(mcpx exec:github:search_repositories:*)");
		expect(settings.permissions.allow).toContain("Shell(mcpx exec:github:get_file:*)");
		expect(settings.permissions.allow).not.toContain("Shell(mcpx exec:github:*)");
	});

	test("allows --all", async () => {
		const { exitCode } = await run(["allow", "--all", "--cursor", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readCursorSettings(tmpDir);
		expect(settings.permissions.allow).toContain("Shell(mcpx exec:*)");
	});

	test("allows --all-read", async () => {
		const { exitCode } = await run(["allow", "--all-read", "--cursor", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readCursorSettings(tmpDir);
		expect(settings.permissions.allow).toContain("Shell(mcpx search:*)");
		expect(settings.permissions.allow).toContain("Shell(mcpx info:*)");
		expect(settings.permissions.allow).toContain("Shell(mcpx servers:*)");
		expect(settings.permissions.allow).toContain("Shell(mcpx ping:*)");
		expect(settings.permissions.allow).toContain("Shell(mcpx resource:*)");
		expect(settings.permissions.allow).toContain("Shell(mcpx prompt:*)");
		expect(settings.permissions.allow).toContain("Shell(mcpx task:*)");
		expect(settings.permissions.allow).toContain("Shell(mcpx index:*)");
	});

	test("deduplicates patterns on repeated runs", async () => {
		await run(["allow", "github", "--cursor", "--json"], tmpDir);
		await run(["allow", "github", "--cursor", "--json"], tmpDir);

		const settings = await readCursorSettings(tmpDir);
		const count = settings.permissions.allow.filter((p: string) => p === "Shell(mcpx exec:github:*)").length;
		expect(count).toBe(1);
	});

	test("preserves existing non-mcpx permissions", async () => {
		const cursorDir = join(tmpDir, ".cursor");
		await mkdir(cursorDir, { recursive: true });
		await writeFile(
			join(cursorDir, "cli.json"),
			JSON.stringify({
				permissions: { allow: ["Shell(git)"] },
			}),
		);

		await run(["allow", "github", "--cursor", "--json"], tmpDir);

		const settings = await readCursorSettings(tmpDir);
		expect(settings.permissions.allow).toContain("Shell(git)");
		expect(settings.permissions.allow).toContain("Shell(mcpx exec:github:*)");
	});

	test("dry-run does not write", async () => {
		const { exitCode, stdout } = await run(["allow", "github", "--cursor", "--dry-run", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const parsed = JSON.parse(stdout);
		expect(parsed.patterns).toContain("Shell(mcpx exec:github:*)");

		// File should not exist
		try {
			await readCursorSettings(tmpDir);
			throw new Error("expected file to not exist");
		} catch (e: unknown) {
			if (e instanceof Error && e.message === "expected file to not exist") throw e;
		}
	});

	test("--list shows Cursor permissions", async () => {
		await run(["allow", "github", "--cursor", "--json"], tmpDir);
		const { exitCode, stdout } = await run(["allow", "--list", "--cursor", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const parsed = JSON.parse(stdout);
		expect(Array.isArray(parsed)).toBe(true);
		const local = parsed.find((r: { scope: string }) => r.scope === "local");
		expect(local.patterns).toContain("Shell(mcpx exec:github:*)");
	});

	test("does not affect Claude settings", async () => {
		await run(["allow", "github", "--cursor", "--json"], tmpDir);

		// Claude settings should not exist
		try {
			await readSettings(tmpDir);
			throw new Error("expected Claude settings to not exist");
		} catch (e: unknown) {
			if (e instanceof Error && e.message === "expected Claude settings to not exist") throw e;
		}
	});
});

describe("mcpx deny --cursor", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "mcpx-deny-cursor-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true });
	});

	test("removes a server permission", async () => {
		await run(["allow", "github", "--cursor", "--json"], tmpDir);

		const settingsBefore = await readCursorSettings(tmpDir);
		expect(settingsBefore.permissions.allow).toContain("Shell(mcpx exec:github:*)");

		const { exitCode } = await run(["deny", "github", "--cursor", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readCursorSettings(tmpDir);
		expect(settings.permissions.allow).not.toContain("Shell(mcpx exec:github:*)");
	});

	test("removes specific tool permissions", async () => {
		await run(["allow", "github", "search_repositories", "get_file", "--cursor", "--json"], tmpDir);

		const { exitCode } = await run(["deny", "github", "search_repositories", "--cursor", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readCursorSettings(tmpDir);
		expect(settings.permissions.allow).not.toContain("Shell(mcpx exec:github:search_repositories:*)");
		expect(settings.permissions.allow).toContain("Shell(mcpx exec:github:get_file:*)");
	});

	test("removes server and all its tool patterns", async () => {
		await run(["allow", "github", "--cursor", "--json"], tmpDir);
		await run(["allow", "github", "search_repositories", "--cursor", "--json"], tmpDir);

		const { exitCode } = await run(["deny", "github", "--cursor", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readCursorSettings(tmpDir);
		const githubPatterns = settings.permissions.allow.filter((p: string) => p.includes("mcpx exec:github"));
		expect(githubPatterns.length).toBe(0);
	});

	test("--all removes all mcpx patterns", async () => {
		await run(["allow", "github", "--cursor", "--json"], tmpDir);
		await run(["allow", "--all-read", "--cursor", "--json"], tmpDir);

		const { exitCode } = await run(["deny", "--all", "--cursor", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readCursorSettings(tmpDir);
		const mcpxPatterns = (settings.permissions.allow as string[]).filter((p) => p.startsWith("Shell(mcpx "));
		expect(mcpxPatterns.length).toBe(0);
	});

	test("--all-read removes read-only patterns", async () => {
		await run(["allow", "--all-read", "--cursor", "--json"], tmpDir);
		await run(["allow", "github", "--cursor", "--json"], tmpDir);

		const { exitCode } = await run(["deny", "--all-read", "--cursor", "--json"], tmpDir);
		expect(exitCode).toBe(0);

		const settings = await readCursorSettings(tmpDir);
		expect(settings.permissions.allow).not.toContain("Shell(mcpx search:*)");
		expect(settings.permissions.allow).toContain("Shell(mcpx exec:github:*)");
	});

	test("preserves non-mcpx permissions", async () => {
		const cursorDir = join(tmpDir, ".cursor");
		await mkdir(cursorDir, { recursive: true });
		await writeFile(
			join(cursorDir, "cli.json"),
			JSON.stringify({
				permissions: { allow: ["Shell(git)", "Shell(mcpx exec:github:*)"] },
			}),
		);

		await run(["deny", "--all", "--cursor", "--json"], tmpDir);

		const settings = await readCursorSettings(tmpDir);
		expect(settings.permissions.allow).toContain("Shell(git)");
		expect(settings.permissions.allow).not.toContain("Shell(mcpx exec:github:*)");
	});

	test("does not affect Claude settings", async () => {
		// Set up Claude settings
		const claudeDir = join(tmpDir, ".claude");
		await mkdir(claudeDir, { recursive: true });
		await writeFile(
			join(claudeDir, "settings.local.json"),
			JSON.stringify({
				permissions: { allow: ["Bash(mcpx exec:github:*)"] },
			}),
		);

		// Set up Cursor settings
		await run(["allow", "github", "--cursor", "--json"], tmpDir);
		await run(["deny", "--all", "--cursor", "--json"], tmpDir);

		// Claude settings should be untouched
		const claudeSettings = await readSettings(tmpDir);
		expect(claudeSettings.permissions.allow).toContain("Bash(mcpx exec:github:*)");
	});
});
