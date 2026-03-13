import { describe, test, expect, afterAll } from "bun:test";
import { join } from "path";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { run, runWithStdin, CLI, CONFIG } from "../helpers/run.ts";

const tempDir = mkdtempSync(join(tmpdir(), "mcpcli-test-"));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

describe("mcpcli exec", () => {
  test("calls a tool with inline JSON args", async () => {
    const proc = run("exec", "mock", "echo", '{"message": "hello world"}');
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.content[0].text).toBe("hello world");
  });

  test("calls add tool", async () => {
    const proc = run("exec", "mock", "add", '{"a": 10, "b": 20}');
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.content[0].text).toBe(30);
  });

  test("reads args from stdin", async () => {
    const proc = runWithStdin('{"message": "from stdin"}', "exec", "mock", "echo");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.content[0].text).toBe("from stdin");
  });

  test("reads args piped from a file via stdin", async () => {
    const filePath = join(tempDir, "pipe-args.json");
    writeFileSync(filePath, '{"message": "piped from file"}');
    const proc = Bun.spawn(
      ["bash", "-c", `cat ${filePath} | bun run ${CLI} -c ${CONFIG} exec mock echo`],
      {
        stdout: "pipe",
        stderr: "pipe",
        cwd: join(import.meta.dir, "../.."),
      },
    );
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.content[0].text).toBe("piped from file");
  });

  test("calls a tool with no args (no {} required)", async () => {
    const proc = run("exec", "mock", "noop");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.content[0].text).toBe("ok");
  });

  test("errors on invalid JSON", async () => {
    const proc = run("exec", "mock", "echo", "not json");
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid JSON");
  });

  test("errors on unknown server", async () => {
    const proc = run("exec", "nonexistent", "tool", "{}");
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown server");
  });

  test("validates missing required field", async () => {
    const proc = run("exec", "mock", "echo", "{}");
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("message");
  });

  test("validates wrong type", async () => {
    const proc = run("exec", "mock", "add", '{"a": "not a number", "b": 1}');
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("number");
  });

  test("passes validation with correct args", async () => {
    const proc = run("exec", "mock", "echo", '{"message": "valid"}');
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });

  test("reads args from --file", async () => {
    const filePath = join(tempDir, "args.json");
    writeFileSync(filePath, '{"message": "from file"}');
    const proc = run("exec", "mock", "echo", "-f", filePath);
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.content[0].text).toBe("from file");
  });

  test("errors when both --file and inline args provided", async () => {
    const filePath = join(tempDir, "args2.json");
    writeFileSync(filePath, '{"message": "from file"}');
    const proc = run("exec", "mock", "echo", '{"message": "inline"}', "-f", filePath);
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Cannot specify both --file and inline JSON args");
  });

  test("errors when --file path does not exist", async () => {
    const proc = run("exec", "mock", "echo", "-f", "/tmp/nonexistent-mcpcli-test.json");
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("File not found");
  });

  test("--no-interactive declines elicitation requests", async () => {
    const proc = run("--no-interactive", "exec", "mock", "confirm_action", '{"action": "deploy"}');
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.content[0].text).toContain("declined");
  });
});
