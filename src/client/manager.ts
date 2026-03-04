import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import picomatch from "picomatch";
import type { Tool, ServerConfig, ServersFile, AuthFile } from "../config/schemas.ts";
import { isStdioServer, isHttpServer } from "../config/schemas.ts";
import { createStdioTransport } from "./stdio.ts";
import { createHttpTransport } from "./http.ts";
import { McpOAuthProvider } from "./oauth.ts";

export interface ToolWithServer {
  server: string;
  tool: Tool;
}

export interface ServerError {
  server: string;
  message: string;
}

export class ServerManager {
  private clients = new Map<string, Client>();
  private transports = new Map<string, Transport>();
  private oauthProviders = new Map<string, McpOAuthProvider>();
  private servers: ServersFile;
  private configDir: string;
  private auth: AuthFile;
  private concurrency: number;
  private verbose: boolean;
  private showSecrets: boolean;

  constructor(
    servers: ServersFile,
    configDir: string,
    auth: AuthFile,
    concurrency = 5,
    verbose = false,
    showSecrets = false,
  ) {
    this.servers = servers;
    this.configDir = configDir;
    this.auth = auth;
    this.concurrency = concurrency;
    this.verbose = verbose;
    this.showSecrets = showSecrets;
  }

  /** Get or create a connected client for a server */
  async getClient(serverName: string): Promise<Client> {
    const existing = this.clients.get(serverName);
    if (existing) return existing;

    const config = this.servers.mcpServers[serverName];
    if (!config) {
      throw new Error(`Unknown server: "${serverName}"`);
    }

    // Auto-refresh expired OAuth tokens before connecting to HTTP servers
    if (isHttpServer(config)) {
      const provider = this.getOrCreateOAuthProvider(serverName);
      if (!provider.isComplete()) {
        throw new Error(`Not authenticated with "${serverName}". Run: mcpcli auth ${serverName}`);
      }
      try {
        await provider.refreshIfNeeded(config.url);
      } catch {
        // If refresh fails, continue — the transport will send the existing token
      }
    }

    const transport = this.createTransport(serverName, config);
    this.transports.set(serverName, transport);

    const client = new Client({ name: "mcpcli", version: "0.1.0" });
    await client.connect(transport);
    this.clients.set(serverName, client);

    return client;
  }

  private getOrCreateOAuthProvider(serverName: string): McpOAuthProvider {
    let provider = this.oauthProviders.get(serverName);
    if (!provider) {
      provider = new McpOAuthProvider({
        serverName,
        configDir: this.configDir,
        auth: this.auth,
      });
      this.oauthProviders.set(serverName, provider);
    }
    return provider;
  }

  private createTransport(serverName: string, config: ServerConfig): Transport {
    if (isStdioServer(config)) {
      return createStdioTransport(config);
    }
    if (isHttpServer(config)) {
      // Only pass the OAuth provider if the server already has tokens.
      // Without tokens, passing the provider causes the SDK transport to
      // auto-trigger the browser OAuth flow on 401, which fails because
      // there's no callback server running. Users must run `mcpcli auth <server>` first.
      const provider = this.getOrCreateOAuthProvider(serverName);
      return createHttpTransport(
        config,
        provider.isComplete() ? provider : undefined,
        this.verbose,
        this.showSecrets,
      );
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
  async getAllTools(): Promise<{ tools: ToolWithServer[]; errors: ServerError[] }> {
    const serverNames = Object.keys(this.servers.mcpServers);
    const tools: ToolWithServer[] = [];
    const errors: ServerError[] = [];

    // Process in batches of `concurrency`
    for (let i = 0; i < serverNames.length; i += this.concurrency) {
      const batch = serverNames.slice(i, i + this.concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(async (name) => {
          const serverTools = await this.listTools(name);
          return serverTools.map((tool) => ({ server: name, tool }));
        }),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j]!;
        if (result.status === "fulfilled") {
          tools.push(...result.value);
        } else {
          const name = batch[j]!;
          const message =
            result.reason instanceof Error ? result.reason.message : String(result.reason);
          errors.push({ server: name, message });
        }
      }
    }

    return { tools, errors };
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
