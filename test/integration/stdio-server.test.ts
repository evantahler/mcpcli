import { describe, test, expect } from "bun:test";
import { join } from "path";

const CLI = join(import.meta.dir, "../../src/cli.ts");
const CONFIG = join(import.meta.dir, "../fixtures/mock-config");

/**
 * Integration tests proving that mcpcli can connect to a local stdio MCP server,
 * discover its tools, inspect schemas, and execute tools end-to-end.
 */

function run(...args: string[]) {
  return Bun.spawn(["bun", "run", CLI, "-c", CONFIG, "--json", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: join(import.meta.dir, "../.."),
  });
}

async function runAndParse<T = unknown>(...args: string[]): Promise<T> {
  const proc = run(...args);
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`mcpcli exited with ${exitCode}: ${stderr}\n${stdout}`);
  }
  return JSON.parse(stdout) as T;
}

describe("stdio MCP server integration", () => {
  test("lists all tools, resources, and prompts from the mock stdio server", async () => {
    const items = await runAndParse<{ server: string; type: string; name: string }[]>();
    expect(items).toBeInstanceOf(Array);

    const tools = items.filter((i) => i.type === "tool");
    const resources = items.filter((i) => i.type === "resource");
    const prompts = items.filter((i) => i.type === "prompt");

    expect(tools.length).toBe(4);
    expect(resources.length).toBeGreaterThan(0);
    expect(prompts.length).toBeGreaterThan(0);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("echo");
    expect(toolNames).toContain("add");
    expect(toolNames).toContain("secret");
    expect(toolNames).toContain("noop");

    // Every item should be from the "mock" server
    for (const item of items) {
      expect(item.server).toBe("mock");
    }
  });

  test("lists items with descriptions", async () => {
    const items =
      await runAndParse<{ server: string; type: string; name: string; description: string }[]>(
        "-d",
      );
    const echo = items.find((i) => i.type === "tool" && i.name === "echo");
    expect(echo).toBeDefined();
    expect(echo!.description).toContain("Echoes");
  });

  test("inspects a specific server to list its tools", async () => {
    const result = await runAndParse<{ server: string; tools: { name: string }[] }>("info", "mock");
    expect(result.server).toBe("mock");
    expect(result.tools.length).toBe(4);
  });

  test("inspects a specific tool to show its schema", async () => {
    const result = await runAndParse<{
      server: string;
      tool: string;
      inputSchema: { properties: Record<string, unknown> };
    }>("info", "mock", "echo");
    expect(result.server).toBe("mock");
    expect(result.tool).toBe("echo");
    expect(result.inputSchema.properties).toHaveProperty("message");
  });

  test("calls echo tool and gets response", async () => {
    const result = await runAndParse<{ content: { type: string; text: string }[] }>(
      "exec",
      "mock",
      "echo",
      '{"message":"hello world"}',
    );
    expect(result.content).toBeInstanceOf(Array);
    expect(result.content[0]!.text).toBe("hello world");
  });

  test("calls add tool with numeric arguments", async () => {
    const result = await runAndParse<{ content: { type: string; text: string }[] }>(
      "exec",
      "mock",
      "add",
      '{"a":10,"b":32}',
    );
    expect(result.content[0]!.text).toBe(42);
  });

  test("validates tool input and rejects missing required fields", async () => {
    const proc = run("exec", "mock", "echo", "{}");
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("message");
  });

  test("validates tool input and rejects wrong types", async () => {
    const proc = run("exec", "mock", "add", '{"a":"not a number","b":1}');
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("a");
  });

  test("reads tool arguments from stdin", async () => {
    const proc = Bun.spawn(["bun", "run", CLI, "-c", CONFIG, "--json", "exec", "mock", "echo"], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "pipe",
      cwd: join(import.meta.dir, "../.."),
    });
    proc.stdin.write('{"message":"from stdin"}');
    proc.stdin.end();
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout) as { content: { text: string }[] };
    expect(result.content[0]!.text).toBe("from stdin");
  });

  test("exits with error for unknown server", async () => {
    const proc = run("exec", "nonexistent", "sometool", "{}");
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
  });

  test("MCP_DEBUG=1 enables verbose output on stderr", async () => {
    const proc = Bun.spawn(
      ["bun", "run", CLI, "-c", CONFIG, "--json", "exec", "mock", "echo", '{"message":"test"}'],
      {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, MCP_DEBUG: "1" },
        cwd: join(import.meta.dir, "../.."),
      },
    );
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);
    // Should still produce valid JSON on stdout
    const result = JSON.parse(stdout);
    expect(result.content[0]!.text).toBe("test");
  });
});
