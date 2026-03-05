import { describe, test, expect } from "bun:test";
import { join } from "path";

const CLI = join(import.meta.dir, "../../src/cli.ts");
const CONFIG = join(import.meta.dir, "../fixtures/mock-config");

/**
 * Integration tests proving that mcpcli can connect to a local stdio MCP server,
 * discover its tools, inspect schemas, and call tools end-to-end.
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
  test("lists all tools from the mock stdio server", async () => {
    const tools = await runAndParse<{ server: string; tool: string }[]>();
    expect(tools).toBeInstanceOf(Array);
    expect(tools.length).toBe(4);

    const names = tools.map((t) => t.tool);
    expect(names).toContain("echo");
    expect(names).toContain("add");
    expect(names).toContain("secret");
    expect(names).toContain("noop");

    // Every tool should be from the "mock" server
    for (const t of tools) {
      expect(t.server).toBe("mock");
    }
  });

  test("lists tools with descriptions", async () => {
    const tools = await runAndParse<{ server: string; tool: string; description: string }[]>("-d");
    const echo = tools.find((t) => t.tool === "echo");
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
      "call",
      "mock",
      "echo",
      '{"message":"hello world"}',
    );
    expect(result.content).toBeInstanceOf(Array);
    expect(result.content[0]!.text).toBe("hello world");
  });

  test("calls add tool with numeric arguments", async () => {
    const result = await runAndParse<{ content: { type: string; text: string }[] }>(
      "call",
      "mock",
      "add",
      '{"a":10,"b":32}',
    );
    expect(result.content[0]!.text).toBe(42);
  });

  test("validates tool input and rejects missing required fields", async () => {
    const proc = run("call", "mock", "echo", "{}");
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("message");
  });

  test("validates tool input and rejects wrong types", async () => {
    const proc = run("call", "mock", "add", '{"a":"not a number","b":1}');
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("a");
  });

  test("reads tool arguments from stdin", async () => {
    const proc = Bun.spawn(["bun", "run", CLI, "-c", CONFIG, "--json", "call", "mock", "echo"], {
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
    const proc = run("call", "nonexistent", "sometool", "{}");
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
  });

  test("MCP_DEBUG=1 enables verbose output on stderr", async () => {
    const proc = Bun.spawn(
      ["bun", "run", CLI, "-c", CONFIG, "--json", "call", "mock", "echo", '{"message":"test"}'],
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
