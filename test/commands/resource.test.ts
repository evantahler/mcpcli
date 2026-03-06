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

describe("mcpcli resources", () => {
  test("resources <server> lists resources for that server", async () => {
    const proc = run("resource", "mock");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.server).toBe("mock");
    expect(Array.isArray(result.resources)).toBe(true);
    expect(result.resources.length).toBeGreaterThan(0);
    expect(result.resources.map((r: { uri: string }) => r.uri)).toContain("file:///hello.txt");
  });

  test("resources <server> <uri> reads a specific resource", async () => {
    const proc = run("resource", "mock", "file:///hello.txt");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.server).toBe("mock");
    expect(result.uri).toBe("file:///hello.txt");
    expect(result.contents).toBeDefined();
  });

  test("resources lists all resources across servers", async () => {
    const proc = run("resource");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("server");
    expect(result[0]).toHaveProperty("uri");
  });

  test("resources <server> <uri> errors on unknown URI", async () => {
    const proc = run("resource", "mock", "file:///nonexistent.txt");
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
  });
});
