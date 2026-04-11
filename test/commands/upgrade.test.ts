import { describe, test, expect } from "bun:test";
import { run, runJson } from "../helpers/run.ts";

describe("mcpx upgrade", () => {
  test("detects local-dev and exits 0", async () => {
    const proc = run("upgrade");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    // In dev environment, it should either be up-to-date or say "running from source"
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });

  test("returns valid JSON with --json flag", async () => {
    const proc = runJson("upgrade");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result).toHaveProperty("currentVersion");
  });
});
