import { describe, test, expect } from "bun:test";
import { run, runJson } from "../helpers/run.ts";

describe("mcpx check-update", () => {
  test("runs and exits 0", async () => {
    const proc = run("check-update");
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });

  test("returns valid JSON with --json flag", async () => {
    const proc = runJson("check-update");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result).toHaveProperty("currentVersion");
    expect(result).toHaveProperty("latestVersion");
    expect(result).toHaveProperty("hasUpdate");
    expect(typeof result.currentVersion).toBe("string");
    expect(typeof result.latestVersion).toBe("string");
    expect(typeof result.hasUpdate).toBe("boolean");
  });
});
