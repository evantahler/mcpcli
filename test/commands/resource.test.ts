import { describe, test, expect } from "bun:test";
import { runJson } from "../helpers/run.ts";

describe("mcpcli resources", () => {
  test("resources <server> lists resources for that server", async () => {
    const proc = runJson("resource", "mock");
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
    const proc = runJson("resource", "mock", "file:///hello.txt");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const result = JSON.parse(stdout);
    expect(result.server).toBe("mock");
    expect(result.uri).toBe("file:///hello.txt");
    expect(result.contents).toBeDefined();
  });

  test("resources lists all resources across servers", async () => {
    const proc = runJson("resource");
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
    const proc = runJson("resource", "mock", "file:///nonexistent.txt");
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
  });
});
