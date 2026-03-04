import { describe, test, expect } from "bun:test";
import { join } from "path";

const CONFIG = join(import.meta.dir, "fixtures/mock-config");

describe("mcpcli", () => {
  test("--help exits 0 and shows usage", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "--help"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);
    expect(stdout).toContain("mcpcli");
    expect(stdout).toContain("curl for MCP");
  });

  test("--version exits 0", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("default command runs without error", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "-c", CONFIG], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });

  test("subcommands are registered", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "--help"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(stdout).toContain("info");
    expect(stdout).toContain("search");
    expect(stdout).toContain("call");
    expect(stdout).toContain("auth");
  });
});
