import { describe, test, expect } from "bun:test";
import { runJson } from "../helpers/run.ts";

describe("mcpx prompts", () => {
  test("prompts <server> lists prompts for that server", async () => {
    const proc = runJson("prompt", "mock");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.server).toBe("mock");
    expect(Array.isArray(result.prompts)).toBe(true);
    expect(result.prompts.length).toBeGreaterThan(0);
    expect(result.prompts.map((p: { name: string }) => p.name)).toContain("greet");
  });

  test("prompts <server> <name> gets a specific prompt", async () => {
    const proc = runJson("prompt", "mock", "greet", '{"name":"World"}');
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.server).toBe("mock");
    expect(result.prompt).toBe("greet");
    expect(Array.isArray(result.messages)).toBe(true);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  test("prompts <server> <name> works without arguments", async () => {
    const proc = runJson("prompt", "mock", "summarize");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.server).toBe("mock");
    expect(result.prompt).toBe("summarize");
    expect(Array.isArray(result.messages)).toBe(true);
  });

  test("prompts lists all prompts across servers", async () => {
    const proc = runJson("prompt");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("server");
    expect(result[0]).toHaveProperty("name");
  });

  test("prompts <server> <name> errors on unknown prompt", async () => {
    const proc = runJson("prompt", "mock", "nonexistent");
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
  });
});
