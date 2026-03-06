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

describe("mcpcli (list)", () => {
  test("lists tools, resources, and prompts from mock server as JSON when piped", async () => {
    const proc = run("--json");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const items = JSON.parse(stdout);
    expect(Array.isArray(items)).toBe(true);

    const types = items.map((i: { type: string }) => i.type);
    expect(types).toContain("tool");
    expect(types).toContain("resource");
    expect(types).toContain("prompt");

    const names = items.map((i: { name: string }) => i.name);
    expect(names).toContain("echo");
    expect(names).toContain("file:///hello.txt");
    expect(names).toContain("greet");
  });

  test("items include server and name fields", async () => {
    const proc = run("--json");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const items = JSON.parse(stdout);
    const echo = items.find((i: { name: string }) => i.name === "echo");
    expect(echo.server).toBe("mock");
    expect(echo.type).toBe("tool");
  });

  test("lists items with descriptions when -d flag is set", async () => {
    const proc = run("--json", "-d");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const items = JSON.parse(stdout);
    const echo = items.find((i: { name: string }) => i.name === "echo");
    expect(echo.description).toContain("Echoes");
  });

  test("items are sorted by server, then type (tool < resource < prompt), then name", async () => {
    const proc = run("--json");
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);

    const items: { server: string; type: string; name: string }[] = JSON.parse(stdout);
    const typeOrder: Record<string, number> = { tool: 0, resource: 1, prompt: 2 };

    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1]!;
      const b = items[i]!;
      if (a.server === b.server && a.type === b.type) {
        expect(a.name.localeCompare(b.name)).toBeLessThanOrEqual(0);
      }
      if (a.server === b.server) {
        expect(typeOrder[a.type]!).toBeLessThanOrEqual(typeOrder[b.type]!);
      }
    }
  });
});
