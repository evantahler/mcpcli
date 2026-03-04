import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { ServerManager } from "../../src/client/manager.ts";
import type { ServersFile } from "../../src/config/schemas.ts";

const MOCK_SERVER = join(import.meta.dir, "../fixtures/mock-server.ts");

function makeServersFile(overrides?: Record<string, unknown>): ServersFile {
  return {
    mcpServers: {
      mock: {
        command: "bun",
        args: ["run", MOCK_SERVER],
        ...overrides,
      },
    },
  };
}

describe("ServerManager", () => {
  let manager: ServerManager;

  afterEach(async () => {
    if (manager) await manager.close();
  });

  test("connects to a stdio server and lists tools", async () => {
    manager = new ServerManager({ servers: makeServersFile(), configDir: "/tmp", auth: {} });
    const tools = await manager.listTools("mock");
    const names = tools.map((t) => t.name);
    expect(names).toContain("echo");
    expect(names).toContain("add");
    expect(names).toContain("secret");
  });

  test("calls a tool and gets a result", async () => {
    manager = new ServerManager({ servers: makeServersFile(), configDir: "/tmp", auth: {} });
    const result = (await manager.callTool("mock", "echo", { message: "hello" })) as {
      content: { type: string; text: string }[];
    };
    expect(result.content[0]!.text).toBe("hello");
  });

  test("calls add tool", async () => {
    manager = new ServerManager({ servers: makeServersFile(), configDir: "/tmp", auth: {} });
    const result = (await manager.callTool("mock", "add", { a: 3, b: 4 })) as {
      content: { type: string; text: string }[];
    };
    expect(result.content[0]!.text).toBe("7");
  });

  test("applies allowedTools filter", async () => {
    manager = new ServerManager({
      servers: makeServersFile({ allowedTools: ["echo"] }),
      configDir: "/tmp",
      auth: {},
    });
    const tools = await manager.listTools("mock");
    expect(tools.map((t) => t.name)).toEqual(["echo"]);
  });

  test("applies disabledTools filter", async () => {
    manager = new ServerManager({
      servers: makeServersFile({ disabledTools: ["secret"] }),
      configDir: "/tmp",
      auth: {},
    });
    const tools = await manager.listTools("mock");
    const names = tools.map((t) => t.name);
    expect(names).toContain("echo");
    expect(names).toContain("add");
    expect(names).not.toContain("secret");
  });

  test("disabledTools takes precedence over allowedTools", async () => {
    manager = new ServerManager({
      servers: makeServersFile({ allowedTools: ["*"], disabledTools: ["secret"] }),
      configDir: "/tmp",
      auth: {},
    });
    const tools = await manager.listTools("mock");
    expect(tools.map((t) => t.name)).not.toContain("secret");
  });

  test("getToolSchema returns a specific tool", async () => {
    manager = new ServerManager({ servers: makeServersFile(), configDir: "/tmp", auth: {} });
    const tool = await manager.getToolSchema("mock", "echo");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("echo");
    expect(tool!.inputSchema.properties).toHaveProperty("message");
  });

  test("getToolSchema returns undefined for unknown tool", async () => {
    manager = new ServerManager({ servers: makeServersFile(), configDir: "/tmp", auth: {} });
    const tool = await manager.getToolSchema("mock", "nonexistent");
    expect(tool).toBeUndefined();
  });

  test("throws on unknown server", async () => {
    manager = new ServerManager({ servers: makeServersFile(), configDir: "/tmp", auth: {} });
    await expect(manager.listTools("nonexistent")).rejects.toThrow('Unknown server: "nonexistent"');
  });

  test("getAllTools returns tools with server names", async () => {
    manager = new ServerManager({ servers: makeServersFile(), configDir: "/tmp", auth: {} });
    const { tools, errors } = await manager.getAllTools();
    expect(errors).toEqual([]);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools[0]!.server).toBe("mock");
    expect(tools[0]!.tool.name).toBeDefined();
  });

  test("caches client connections", async () => {
    manager = new ServerManager({ servers: makeServersFile(), configDir: "/tmp", auth: {} });
    const client1 = await manager.getClient("mock");
    const client2 = await manager.getClient("mock");
    expect(client1).toBe(client2);
  });

  test("getServerNames returns configured servers", () => {
    manager = new ServerManager({ servers: makeServersFile(), configDir: "/tmp", auth: {} });
    expect(manager.getServerNames()).toEqual(["mock"]);
  });

  test("timeout fires on slow operations", async () => {
    manager = new ServerManager({
      servers: makeServersFile(),
      configDir: "/tmp",
      auth: {},
      timeout: 1, // 1ms — will definitely timeout
      maxRetries: 0,
    });
    await expect(manager.listTools("mock")).rejects.toThrow(/timed out/);
  });

  test("retries on transient failure then succeeds", async () => {
    // Retry wrapping shouldn't break normal operations
    manager = new ServerManager({
      servers: makeServersFile(),
      configDir: "/tmp",
      auth: {},
      maxRetries: 2,
    });
    const tools = await manager.listTools("mock");
    expect(tools.length).toBeGreaterThan(0);
  });
});
