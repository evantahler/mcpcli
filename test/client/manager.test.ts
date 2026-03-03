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
    manager = new ServerManager(makeServersFile());
    const tools = await manager.listTools("mock");
    const names = tools.map((t) => t.name);
    expect(names).toContain("echo");
    expect(names).toContain("add");
    expect(names).toContain("secret");
  });

  test("calls a tool and gets a result", async () => {
    manager = new ServerManager(makeServersFile());
    const result = (await manager.callTool("mock", "echo", { message: "hello" })) as {
      content: { type: string; text: string }[];
    };
    expect(result.content[0]!.text).toBe("hello");
  });

  test("calls add tool", async () => {
    manager = new ServerManager(makeServersFile());
    const result = (await manager.callTool("mock", "add", { a: 3, b: 4 })) as {
      content: { type: string; text: string }[];
    };
    expect(result.content[0]!.text).toBe("7");
  });

  test("applies allowedTools filter", async () => {
    manager = new ServerManager(
      makeServersFile({
        allowedTools: ["echo"],
      }),
    );
    const tools = await manager.listTools("mock");
    expect(tools.map((t) => t.name)).toEqual(["echo"]);
  });

  test("applies disabledTools filter", async () => {
    manager = new ServerManager(
      makeServersFile({
        disabledTools: ["secret"],
      }),
    );
    const tools = await manager.listTools("mock");
    const names = tools.map((t) => t.name);
    expect(names).toContain("echo");
    expect(names).toContain("add");
    expect(names).not.toContain("secret");
  });

  test("disabledTools takes precedence over allowedTools", async () => {
    manager = new ServerManager(
      makeServersFile({
        allowedTools: ["*"],
        disabledTools: ["secret"],
      }),
    );
    const tools = await manager.listTools("mock");
    expect(tools.map((t) => t.name)).not.toContain("secret");
  });

  test("getToolSchema returns a specific tool", async () => {
    manager = new ServerManager(makeServersFile());
    const tool = await manager.getToolSchema("mock", "echo");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("echo");
    expect(tool!.inputSchema.properties).toHaveProperty("message");
  });

  test("getToolSchema returns undefined for unknown tool", async () => {
    manager = new ServerManager(makeServersFile());
    const tool = await manager.getToolSchema("mock", "nonexistent");
    expect(tool).toBeUndefined();
  });

  test("throws on unknown server", async () => {
    manager = new ServerManager(makeServersFile());
    await expect(manager.listTools("nonexistent")).rejects.toThrow('Unknown server: "nonexistent"');
  });

  test("getAllTools returns tools with server names", async () => {
    manager = new ServerManager(makeServersFile());
    const allTools = await manager.getAllTools();
    expect(allTools.length).toBeGreaterThan(0);
    expect(allTools[0]!.server).toBe("mock");
    expect(allTools[0]!.tool.name).toBeDefined();
  });

  test("caches client connections", async () => {
    manager = new ServerManager(makeServersFile());
    const client1 = await manager.getClient("mock");
    const client2 = await manager.getClient("mock");
    expect(client1).toBe(client2);
  });

  test("getServerNames returns configured servers", () => {
    manager = new ServerManager(makeServersFile());
    expect(manager.getServerNames()).toEqual(["mock"]);
  });
});
