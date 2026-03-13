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

describe("server logging", () => {
  test("--log-level debug shows all log messages in JSON mode", async () => {
    const proc = run("-j", "-l", "debug", "exec", "mock", "echo", '{"message": "hi"}');
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(0);

    const logLines = stderr
      .trim()
      .split("\n")
      .filter((l) => {
        try {
          const obj = JSON.parse(l);
          return obj.server === "mock" && obj.level;
        } catch {
          return false;
        }
      });

    // Mock server emits debug, info, and warning on each tool call
    const levels = logLines.map((l) => JSON.parse(l).level);
    expect(levels).toContain("debug");
    expect(levels).toContain("info");
    expect(levels).toContain("warning");
  });

  test("--log-level warning filters out debug and info", async () => {
    const proc = run("-j", "-l", "warning", "exec", "mock", "echo", '{"message": "hi"}');
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(0);

    const logLines = stderr
      .trim()
      .split("\n")
      .filter((l) => {
        try {
          const obj = JSON.parse(l);
          return obj.server === "mock" && obj.level;
        } catch {
          return false;
        }
      });

    const levels = logLines.map((l) => JSON.parse(l).level);
    expect(levels).not.toContain("debug");
    expect(levels).not.toContain("info");
    expect(levels).toContain("warning");
  });

  test("--log-level error filters out everything below error", async () => {
    const proc = run("-j", "-l", "error", "exec", "mock", "echo", '{"message": "hi"}');
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(0);

    const logLines = stderr
      .trim()
      .split("\n")
      .filter((l) => {
        try {
          const obj = JSON.parse(l);
          return obj.server === "mock" && obj.level;
        } catch {
          return false;
        }
      });

    // Mock server only emits debug, info, warning — none are >= error
    expect(logLines).toHaveLength(0);
  });

  test("log messages include logger name and data", async () => {
    const proc = run("-j", "-l", "debug", "exec", "mock", "echo", '{"message": "hi"}');
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(0);

    const logLines = stderr
      .trim()
      .split("\n")
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((obj) => obj?.server === "mock" && obj?.level);

    // The debug message has logger: "mock"
    const debugMsg = logLines.find((l: { level: string }) => l.level === "debug");
    expect(debugMsg).toBeDefined();
    expect(debugMsg.logger).toBe("mock");
    expect(debugMsg.data).toContain("resolving tool");

    // The warning message has no logger
    const warnMsg = logLines.find((l: { level: string }) => l.level === "warning");
    expect(warnMsg).toBeDefined();
    expect(warnMsg.logger).toBeUndefined();
    expect(warnMsg.data).toContain("deprecated");
  });
});
