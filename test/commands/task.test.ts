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

describe("mcpcli task", () => {
  test("exec --no-wait returns task handle for task-supporting tool", async () => {
    const proc = run("exec", "mock", "slow_echo", '{"message": "async hello"}', "--no-wait");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.task).toBeDefined();
    expect(result.task.taskId).toBeDefined();
    expect(result.task.status).toBe("working");
  });

  test("exec with default --wait returns final result for task-supporting tool", async () => {
    const proc = run("exec", "mock", "slow_echo", '{"message": "waited result"}');
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.content[0].text).toBe("waited result");
  });

  test("exec on non-task tool still works normally", async () => {
    const proc = run("exec", "mock", "echo", '{"message": "sync hello"}');
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.content[0].text).toBe("sync hello");
  });

  test("task list returns empty list on fresh server", async () => {
    const proc = run("task", "list", "mock");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.tasks).toBeInstanceOf(Array);
  });

  test("task get errors on nonexistent task", async () => {
    const proc = run("task", "get", "mock", "nonexistent-task-id");
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toContain("Task not found");
  });

  test("task cancel errors on nonexistent task", async () => {
    const proc = run("task", "cancel", "mock", "nonexistent-task-id");
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toContain("Task not found");
  });

  test("task errors on unknown action", async () => {
    const proc = run("task", "bogus", "mock");
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown task action");
  });

  test("task get errors on missing taskId argument", async () => {
    const proc = run("task", "get", "mock");
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("task get");
  });
});
