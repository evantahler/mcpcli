import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "fs/promises";

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

describe("mcpcli skill install", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "mcpcli-skill-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  test("errors without any agent flag", async () => {
    const { exitCode, stderr } = await run(["skill", "install"], tmpDir);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("--claude");
    expect(stderr).toContain("--cursor");
  });

  test("installs to project directory by default with --claude", async () => {
    const { exitCode, stdout } = await run(["skill", "install", "--claude"], tmpDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Installed mcpcli skill for Claude Code (project):");

    const dest = join(tmpDir, ".claude", "skills", "mcpcli.md");
    const content = await readFile(dest, "utf-8");
    expect(content).toContain("mcpcli");
    expect(content).toContain("search");
  });

  test("installs to project directory with --cursor", async () => {
    const { exitCode, stdout } = await run(["skill", "install", "--cursor"], tmpDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Installed mcpcli skill for Cursor (project):");

    const dest = join(tmpDir, ".cursor", "rules", "mcpcli.mdc");
    const content = await readFile(dest, "utf-8");
    expect(content).toContain("mcpcli");
    expect(content).toContain("alwaysApply: true");
  });

  test("installs both with --claude --cursor", async () => {
    const { exitCode, stdout } = await run(["skill", "install", "--claude", "--cursor"], tmpDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Claude Code");
    expect(stdout).toContain("Cursor");

    const claudeDest = join(tmpDir, ".claude", "skills", "mcpcli.md");
    const cursorDest = join(tmpDir, ".cursor", "rules", "mcpcli.mdc");
    const claudeContent = await readFile(claudeDest, "utf-8");
    const cursorContent = await readFile(cursorDest, "utf-8");
    expect(claudeContent).toContain("trigger:");
    expect(cursorContent).toContain("alwaysApply:");
  });

  test("installs to global directory with --global", async () => {
    const { exitCode, stdout } = await run(["skill", "install", "--claude", "--project"], tmpDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("project");

    const dest = join(tmpDir, ".claude", "skills", "mcpcli.md");
    const content = await readFile(dest, "utf-8");
    expect(content).toContain("mcpcli");
  });

  test("errors if file already exists without --force", async () => {
    // First install
    await run(["skill", "install", "--claude"], tmpDir);

    // Second install should fail
    const { exitCode, stderr } = await run(["skill", "install", "--claude"], tmpDir);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("already exists");
    expect(stderr).toContain("--force");
  });

  test("overwrites with --force", async () => {
    // First install
    await run(["skill", "install", "--claude"], tmpDir);

    // Overwrite the file with garbage to verify it gets replaced
    const dest = join(tmpDir, ".claude", "skills", "mcpcli.md");
    await writeFile(dest, "old content", "utf-8");

    // Force install
    const { exitCode, stdout } = await run(["skill", "install", "--claude", "--force"], tmpDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Installed mcpcli skill");

    const content = await readFile(dest, "utf-8");
    expect(content).not.toBe("old content");
    expect(content).toContain("mcpcli");
  });

  test("creates intermediate directories", async () => {
    // The .claude/skills/ dir shouldn't exist yet in a fresh tmpDir
    const { exitCode } = await run(["skill", "install", "--claude"], tmpDir);
    expect(exitCode).toBe(0);

    const dest = join(tmpDir, ".claude", "skills", "mcpcli.md");
    const content = await readFile(dest, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });
});
