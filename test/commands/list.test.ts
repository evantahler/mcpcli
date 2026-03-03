import { describe, test, expect } from "bun:test";
import { join } from "path";

const CLI = join(import.meta.dir, "../../src/cli.ts");
const CONFIG = join(import.meta.dir, "../fixtures/mock-config");

function run(...args: string[]) {
  return Bun.spawn(["bun", "run", CLI, "-c", CONFIG, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: join(import.meta.dir, "../.."),
  });
}

describe("mcpcli (list)", () => {
  test("lists tools from mock server as JSON when piped", async () => {
    const proc = run("--json");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const tools = JSON.parse(stdout);
    expect(Array.isArray(tools)).toBe(true);
    const names = tools.map((t: { tool: string }) => t.tool);
    expect(names).toContain("echo");
    expect(names).toContain("add");
  });

  test("lists tools with descriptions", async () => {
    const proc = run("--json", "-d");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const tools = JSON.parse(stdout);
    const echo = tools.find((t: { tool: string }) => t.tool === "echo");
    expect(echo.description).toContain("Echoes");
  });
});
