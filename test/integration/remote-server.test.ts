import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";

const CLI = join(import.meta.dir, "../../src/cli.ts");
const HTTP_SERVER = join(import.meta.dir, "../fixtures/mock-http-server.ts");
const TIMEOUT = 30_000;

/**
 * End-to-end tests that connect to an HTTP MCP server using the
 * Streamable HTTP transport and exercise core CLI commands.
 *
 * A local HTTP MCP server is started before tests and torn down after.
 * This tests the full HTTP transport path (connection, JSON-RPC over HTTP,
 * session management) without requiring external network access.
 */

let serverProc: ReturnType<typeof Bun.spawn>;
let configDir: string;

function run(...args: string[]) {
  return Bun.spawn(["bun", "run", CLI, "-c", configDir, "--json", ...args], {
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

beforeAll(async () => {
  // Start the HTTP MCP server
  serverProc = Bun.spawn(["bun", "run", HTTP_SERVER], {
    stdout: "pipe",
    stderr: "pipe",
  });

  // Read the server URL from stdout (first line)
  const reader = serverProc.stdout.getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  const serverUrl = new TextDecoder().decode(value).trim();

  // Create a temp config directory pointing to the local HTTP server
  configDir = mkdtempSync(join(tmpdir(), "mcpcli-e2e-"));
  writeFileSync(
    join(configDir, "servers.json"),
    JSON.stringify({
      mcpServers: {
        remote: { url: serverUrl },
      },
    }),
  );
}, TIMEOUT);

afterAll(async () => {
  serverProc?.kill();
  if (configDir) {
    rmSync(configDir, { recursive: true, force: true });
  }
});

interface PingResult {
  server: string;
  success: boolean;
  latencyMs?: number;
  error?: string;
}
interface UnifiedItem {
  server: string;
  type: string;
  name: string;
  description?: string;
}
interface ServerTools {
  server: string;
  tools: { name: string; description?: string }[];
}
interface ToolSchema {
  server: string;
  tool: string;
  inputSchema: { type: string; properties?: Record<string, unknown> };
}
interface CallResult {
  content: { type: string; text: string }[];
}
interface ServerResources {
  server: string;
  resources: { uri: string; name: string; description?: string }[];
}
interface ServerPrompts {
  server: string;
  prompts: { name: string; description?: string }[];
}

describe("HTTP MCP server end-to-end", () => {
  test(
    "pings the server successfully",
    async () => {
      const results = await runAndParse<PingResult[]>("ping");
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(1);
      expect(results[0]!.server).toBe("remote");
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.latencyMs).toBeGreaterThan(0);
    },
    { timeout: TIMEOUT },
  );

  test(
    "lists all tools, resources, and prompts",
    async () => {
      const items = await runAndParse<UnifiedItem[]>();
      expect(items).toBeInstanceOf(Array);

      const tools = items.filter((i) => i.type === "tool");
      expect(tools.length).toBeGreaterThan(0);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("echo");
      expect(toolNames).toContain("add");

      const resources = items.filter((i) => i.type === "resource");
      expect(resources.length).toBeGreaterThan(0);

      const prompts = items.filter((i) => i.type === "prompt");
      expect(prompts.length).toBeGreaterThan(0);

      for (const item of items) {
        expect(item.server).toBe("remote");
      }
    },
    { timeout: TIMEOUT },
  );

  test(
    "lists items with descriptions",
    async () => {
      const items = await runAndParse<UnifiedItem[]>("-d");
      const echo = items.find((i) => i.type === "tool" && i.name === "echo");
      expect(echo).toBeDefined();
      expect(echo!.description!.length).toBeGreaterThan(0);
    },
    { timeout: TIMEOUT },
  );

  test(
    "inspects server to list its tools",
    async () => {
      const result = await runAndParse<ServerTools>("info", "remote");
      expect(result.server).toBe("remote");
      expect(result.tools.length).toBeGreaterThan(0);
      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain("echo");
    },
    { timeout: TIMEOUT },
  );

  test(
    "inspects the echo tool schema",
    async () => {
      const result = await runAndParse<ToolSchema>("info", "remote", "echo");
      expect(result.server).toBe("remote");
      expect(result.tool).toBe("echo");
      expect(result.inputSchema).toBeDefined();
      expect(result.inputSchema.type).toBe("object");
      expect(result.inputSchema.properties).toHaveProperty("message");
    },
    { timeout: TIMEOUT },
  );

  test(
    "executes the echo tool",
    async () => {
      const result = await runAndParse<CallResult>(
        "exec",
        "remote",
        "echo",
        '{"message":"hello from mcpcli"}',
      );
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content.length).toBeGreaterThanOrEqual(1);
      expect(result.content[0]!.type).toBe("text");
      expect(result.content[0]!.text).toContain("hello from mcpcli");
    },
    { timeout: TIMEOUT },
  );

  test(
    "executes the add tool",
    async () => {
      const result = await runAndParse<CallResult>("exec", "remote", "add", '{"a":2,"b":3}');
      expect(result.content).toBeInstanceOf(Array);
      expect(String(result.content[0]!.text)).toBe("5");
    },
    { timeout: TIMEOUT },
  );

  test(
    "validates tool input and rejects missing required fields",
    async () => {
      const proc = run("exec", "remote", "echo", "{}");
      const exitCode = await proc.exited;
      const stderr = await new Response(proc.stderr).text();
      expect(exitCode).toBe(1);
      expect(stderr).toContain("message");
    },
    { timeout: TIMEOUT },
  );

  test(
    "validates tool input and rejects wrong types",
    async () => {
      const proc = run("exec", "remote", "add", '{"a":"not a number","b":1}');
      const exitCode = await proc.exited;
      const stderr = await new Response(proc.stderr).text();
      expect(exitCode).toBe(1);
      expect(stderr).toContain("a");
    },
    { timeout: TIMEOUT },
  );

  test(
    "lists resources for the server",
    async () => {
      const result = await runAndParse<ServerResources>("resource", "remote");
      expect(result.server).toBe("remote");
      expect(result.resources).toBeInstanceOf(Array);
      expect(result.resources.length).toBeGreaterThan(0);
      expect(result.resources[0]).toHaveProperty("uri");
      expect(result.resources[0]).toHaveProperty("name");
    },
    { timeout: TIMEOUT },
  );

  test(
    "lists prompts for the server",
    async () => {
      const result = await runAndParse<ServerPrompts>("prompt", "remote");
      expect(result.server).toBe("remote");
      expect(result.prompts).toBeInstanceOf(Array);
      expect(result.prompts.length).toBeGreaterThan(0);
      expect(result.prompts[0]).toHaveProperty("name");
    },
    { timeout: TIMEOUT },
  );
});
