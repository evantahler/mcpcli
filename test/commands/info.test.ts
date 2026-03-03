import { describe, test, expect } from "bun:test";
import { join } from "path";

const CLI = join(import.meta.dir, "../../src/cli.ts");
const CONFIG = join(import.meta.dir, "../fixtures/mock-config");

function run(...args: string[]) {
  return Bun.spawn(["bun", "run", CLI, "-c", CONFIG, "--json", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: join(import.meta.dir, "../.."),
  });
}

describe("mcpcli info", () => {
  test("info <server> lists tools for that server", async () => {
    const proc = run("info", "mock");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.server).toBe("mock");
    expect(result.tools.length).toBeGreaterThan(0);
    expect(result.tools.map((t: { name: string }) => t.name)).toContain("echo");
  });

  test("info <server>/<tool> shows tool schema", async () => {
    const proc = run("info", "mock/echo");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.server).toBe("mock");
    expect(result.tool).toBe("echo");
    expect(result.inputSchema).toBeDefined();
    expect(result.inputSchema.properties).toHaveProperty("message");
  });

  test("info <server>/<tool> errors on unknown tool", async () => {
    const proc = run("info", "mock/nonexistent");
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("not found");
  });
});
