import { describe, test, expect } from "bun:test";
import { runJson } from "../helpers/run.ts";

describe("mcpcli info", () => {
  test("info <server> shows server overview with capabilities", async () => {
    const proc = runJson("info", "mock");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.server).toBe("mock");

    // Version info
    expect(result.version).toEqual({ name: "mock-server", version: "1.0.0" });

    // Capabilities
    expect(result.capabilities).toHaveProperty("tools");
    expect(result.capabilities).toHaveProperty("resources");
    expect(result.capabilities).toHaveProperty("prompts");

    // Instructions
    expect(result.instructions).toBe("Mock server for testing");

    // Tools (backward compatible)
    expect(result.tools.length).toBeGreaterThan(0);
    expect(result.tools.map((t: { name: string }) => t.name)).toContain("echo");

    // Resource and prompt counts
    expect(result.resourceCount).toBe(2);
    expect(result.promptCount).toBe(2);
  });

  test("info <server> <tool> shows tool schema", async () => {
    const proc = runJson("info", "mock", "echo");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.server).toBe("mock");
    expect(result.tool).toBe("echo");
    expect(result.inputSchema).toBeDefined();
    expect(result.inputSchema.properties).toHaveProperty("message");
  });

  test("info <server> <tool> errors on unknown tool", async () => {
    const proc = runJson("info", "mock", "nonexistent");
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("not found");
  });
});
