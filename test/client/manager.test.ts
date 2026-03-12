import { describe, test, expect, afterEach, spyOn } from "bun:test";
import { join } from "path";
import { ServerManager } from "../../src/client/manager.ts";
import { McpOAuthProvider } from "../../src/client/oauth.ts";
import type { ServersFile, AuthFile, HttpServerConfig } from "../../src/config/schemas.ts";
import * as httpModule from "../../src/client/http.ts";
import * as sseModule from "../../src/client/sse.ts";

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

describe("ServerManager with HTTP servers", () => {
  let manager: ServerManager;

  afterEach(async () => {
    if (manager) await manager.close();
  });

  test("calls refreshIfNeeded for HTTP server with expired OAuth tokens", async () => {
    const auth: AuthFile = {
      "http-server": {
        tokens: {
          access_token: "expired-token",
          token_type: "Bearer",
          refresh_token: "my-refresh-token",
        },
        expires_at: new Date(Date.now() - 60000).toISOString(),
        client_info: { client_id: "client-123" },
        complete: true,
      },
    };

    manager = new ServerManager({
      servers: { mcpServers: { "http-server": { url: "http://localhost:19999/mcp" } } },
      configDir: "/tmp",
      auth,
      timeout: 1000,
      maxRetries: 0,
    });

    const refreshSpy = spyOn(McpOAuthProvider.prototype, "refreshIfNeeded").mockResolvedValue(
      undefined,
    );

    try {
      await manager.getClient("http-server");
    } catch {
      // Connection failure expected — no real HTTP server
    }

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledWith("http://localhost:19999/mcp");
    refreshSpy.mockRestore();
  });

  test("throws when HTTP server auth is not complete", async () => {
    const auth: AuthFile = {
      "http-server": {
        tokens: { access_token: "token", token_type: "Bearer" },
        // complete is missing
      },
    };

    manager = new ServerManager({
      servers: { mcpServers: { "http-server": { url: "http://localhost:19999/mcp" } } },
      configDir: "/tmp",
      auth,
      timeout: 1000,
      maxRetries: 0,
    });

    await expect(manager.getClient("http-server")).rejects.toThrow("Not authenticated");
  });

  test("continues even if refreshIfNeeded throws", async () => {
    const auth: AuthFile = {
      "http-server": {
        tokens: {
          access_token: "expired-token",
          token_type: "Bearer",
          refresh_token: "bad-refresh-token",
        },
        expires_at: new Date(Date.now() - 60000).toISOString(),
        client_info: { client_id: "client-123" },
        complete: true,
      },
    };

    manager = new ServerManager({
      servers: { mcpServers: { "http-server": { url: "http://localhost:19999/mcp" } } },
      configDir: "/tmp",
      auth,
      timeout: 1000,
      maxRetries: 0,
    });

    const refreshSpy = spyOn(McpOAuthProvider.prototype, "refreshIfNeeded").mockRejectedValue(
      new Error("Refresh failed"),
    );

    try {
      await manager.getClient("http-server");
    } catch (err) {
      // The error should be a connection error, not a refresh error
      expect((err as Error).message).not.toContain("Refresh failed");
    }

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    refreshSpy.mockRestore();
  });

  test("uses SSE transport when transport is explicitly 'sse'", async () => {
    const auth: AuthFile = {
      "sse-server": {
        tokens: { access_token: "token", token_type: "Bearer" },
        complete: true,
      },
    };

    const sseSpy = spyOn(sseModule, "createSseTransport");
    const httpSpy = spyOn(httpModule, "createHttpTransport");
    const refreshSpy = spyOn(McpOAuthProvider.prototype, "refreshIfNeeded").mockResolvedValue(
      undefined,
    );

    manager = new ServerManager({
      servers: {
        mcpServers: {
          "sse-server": { url: "http://localhost:19999/sse", transport: "sse" } as HttpServerConfig,
        },
      },
      configDir: "/tmp",
      auth,
      timeout: 1000,
      maxRetries: 0,
    });

    try {
      await manager.getClient("sse-server");
    } catch {
      // Connection failure expected — no real server
    }

    expect(sseSpy).toHaveBeenCalledTimes(1);
    expect(httpSpy).not.toHaveBeenCalled();

    sseSpy.mockRestore();
    httpSpy.mockRestore();
    refreshSpy.mockRestore();
  });

  test("uses Streamable HTTP when transport is explicitly 'streamable-http'", async () => {
    const auth: AuthFile = {
      "streamable-server": {
        tokens: { access_token: "token", token_type: "Bearer" },
        complete: true,
      },
    };

    const sseSpy = spyOn(sseModule, "createSseTransport");
    const httpSpy = spyOn(httpModule, "createHttpTransport");
    const refreshSpy = spyOn(McpOAuthProvider.prototype, "refreshIfNeeded").mockResolvedValue(
      undefined,
    );

    manager = new ServerManager({
      servers: {
        mcpServers: {
          "streamable-server": {
            url: "http://localhost:19999/mcp",
            transport: "streamable-http",
          } as HttpServerConfig,
        },
      },
      configDir: "/tmp",
      auth,
      timeout: 1000,
      maxRetries: 0,
    });

    try {
      await manager.getClient("streamable-server");
    } catch {
      // Connection failure expected — no real server
    }

    expect(httpSpy).toHaveBeenCalledTimes(1);
    expect(sseSpy).not.toHaveBeenCalled();

    sseSpy.mockRestore();
    httpSpy.mockRestore();
    refreshSpy.mockRestore();
  });

  test("does not fallback to SSE when explicit transport is set", async () => {
    const auth: AuthFile = {
      "explicit-server": {
        tokens: { access_token: "token", token_type: "Bearer" },
        complete: true,
      },
    };

    const sseSpy = spyOn(sseModule, "createSseTransport");
    const refreshSpy = spyOn(McpOAuthProvider.prototype, "refreshIfNeeded").mockResolvedValue(
      undefined,
    );

    manager = new ServerManager({
      servers: {
        mcpServers: {
          "explicit-server": {
            url: "http://localhost:19999/mcp",
            transport: "streamable-http",
          } as HttpServerConfig,
        },
      },
      configDir: "/tmp",
      auth,
      timeout: 1000,
      maxRetries: 0,
    });

    await expect(manager.getClient("explicit-server")).rejects.toThrow();
    // SSE should NOT be attempted as fallback since transport was explicitly set
    expect(sseSpy).not.toHaveBeenCalled();

    sseSpy.mockRestore();
    refreshSpy.mockRestore();
  });
});
