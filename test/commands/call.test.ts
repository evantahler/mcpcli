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

function runWithStdin(stdin: string, ...args: string[]) {
  const proc = Bun.spawn(["bun", "run", CLI, "-c", CONFIG, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "pipe",
    cwd: join(import.meta.dir, "../.."),
  });
  proc.stdin.write(stdin);
  proc.stdin.end();
  return proc;
}

describe("mcpcli call", () => {
  test("calls a tool with inline JSON args", async () => {
    const proc = run("call", "mock", "echo", '{"message": "hello world"}');
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.content[0].text).toBe("hello world");
  });

  test("calls add tool", async () => {
    const proc = run("call", "mock", "add", '{"a": 10, "b": 20}');
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.content[0].text).toBe(30);
  });

  test("reads args from stdin", async () => {
    const proc = runWithStdin('{"message": "from stdin"}', "call", "mock", "echo");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.content[0].text).toBe("from stdin");
  });

  test("errors on invalid JSON", async () => {
    const proc = run("call", "mock", "echo", "not json");
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid JSON");
  });

  test("errors on unknown server", async () => {
    const proc = run("call", "nonexistent", "tool", "{}");
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown server");
  });

  test("validates missing required field", async () => {
    const proc = run("call", "mock", "echo", "{}");
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("message");
  });

  test("validates wrong type", async () => {
    const proc = run("call", "mock", "add", '{"a": "not a number", "b": 1}');
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("number");
  });

  test("passes validation with correct args", async () => {
    const proc = run("call", "mock", "echo", '{"message": "valid"}');
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });
});
