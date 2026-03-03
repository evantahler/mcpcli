import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import picomatch from "picomatch";
import type { Tool, ServerConfig, ServersFile } from "../config/schemas.ts";
import { isStdioServer, isHttpServer } from "../config/schemas.ts";
import { createStdioTransport } from "./stdio.ts";
import { createHttpTransport } from "./http.ts";

export interface ToolWithServer {
  server: string;
  tool: Tool;
}

export class ServerManager {
  private clients = new Map<string, Client>();
  private transports = new Map<string, Transport>();
  private servers: ServersFile;
  private concurrency: number;

  constructor(servers: ServersFile, concurrency = 5) {
    this.servers = servers;
    this.concurrency = concurrency;
  }

  /** Get or create a connected client for a server */
  async getClient(serverName: string): Promise<Client> {
    const existing = this.clients.get(serverName);
    if (existing) return existing;

    const config = this.servers.mcpServers[serverName];
    if (!config) {
      throw new Error(`Unknown server: "${serverName}"`);
    }

    const transport = this.createTransport(serverName, config);
    this.transports.set(serverName, transport);

    const client = new Client({ name: "mcpcli", version: "0.1.0" });
    await client.connect(transport);
    this.clients.set(serverName, client);

    return client;
  }

  private createTransport(_serverName: string, config: ServerConfig): Transport {
    if (isStdioServer(config)) {
      return createStdioTransport(config);
    }
    if (isHttpServer(config)) {
      // TODO: pass authProvider when OAuth is implemented (Phase 5)
      return createHttpTransport(config);
    }
    throw new Error("Invalid server config");
  }

  /** List tools for a single server, applying allowedTools/disabledTools filters */
  async listTools(serverName: string): Promise<Tool[]> {
    const client = await this.getClient(serverName);
    const result = await client.listTools();
    const config = this.servers.mcpServers[serverName]!;
    return filterTools(result.tools, config.allowedTools, config.disabledTools);
  }

  /** List tools across all configured servers */
  async getAllTools(): Promise<ToolWithServer[]> {
    const serverNames = Object.keys(this.servers.mcpServers);
    const results: ToolWithServer[] = [];

    // Process in batches of `concurrency`
    for (let i = 0; i < serverNames.length; i += this.concurrency) {
      const batch = serverNames.slice(i, i + this.concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(async (name) => {
          const tools = await this.listTools(name);
          return tools.map((tool) => ({ server: name, tool }));
        }),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j]!;
        if (result.status === "fulfilled") {
          results.push(...result.value);
        } else {
          const name = batch[j]!;
          console.error(`Error connecting to "${name}": ${result.reason}`);
        }
      }
    }

    return results;
  }

  /** Call a tool on a specific server */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    const client = await this.getClient(serverName);
    return client.callTool({ name: toolName, arguments: args });
  }

  /** Get the schema for a specific tool */
  async getToolSchema(serverName: string, toolName: string): Promise<Tool | undefined> {
    const tools = await this.listTools(serverName);
    return tools.find((t) => t.name === toolName);
  }

  /** Get all server names */
  getServerNames(): string[] {
    return Object.keys(this.servers.mcpServers);
  }

  /** Disconnect all clients */
  async close(): Promise<void> {
    const closePromises = [...this.clients.entries()].map(async ([name, client]) => {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
      this.clients.delete(name);
      this.transports.delete(name);
    });
    await Promise.allSettled(closePromises);
  }
}

/** Apply allowedTools/disabledTools glob filters to a tool list */
function filterTools(tools: Tool[], allowedTools?: string[], disabledTools?: string[]): Tool[] {
  let filtered = tools;

  if (allowedTools && allowedTools.length > 0) {
    const isAllowed = picomatch(allowedTools);
    filtered = filtered.filter((t) => isAllowed(t.name));
  }

  if (disabledTools && disabledTools.length > 0) {
    const isDisabled = picomatch(disabledTools);
    filtered = filtered.filter((t) => !isDisabled(t.name));
  }

  return filtered;
}
