import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import picomatch from "picomatch";
import type {
  Tool,
  Resource,
  Prompt,
  ServerConfig,
  ServersFile,
  AuthFile,
} from "../config/schemas.ts";
import { isStdioServer, isHttpServer } from "../config/schemas.ts";
import { createStdioTransport } from "./stdio.ts";
import { createHttpTransport } from "./http.ts";
import { McpOAuthProvider } from "./oauth.ts";

export interface ToolWithServer {
  server: string;
  tool: Tool;
}

export interface ResourceWithServer {
  server: string;
  resource: Resource;
}

export interface PromptWithServer {
  server: string;
  prompt: Prompt;
}

export interface ServerError {
  server: string;
  message: string;
}

export interface ServerManagerOptions {
  servers: ServersFile;
  configDir: string;
  auth: AuthFile;
  concurrency?: number;
  verbose?: boolean;
  showSecrets?: boolean;
  timeout?: number; // ms, default 1_800_000 (30 min)
  maxRetries?: number; // default 3
}

export class ServerManager {
  private clients = new Map<string, Client>();
  private connecting = new Map<string, Promise<Client>>();
  private transports = new Map<string, Transport>();
  private oauthProviders = new Map<string, McpOAuthProvider>();
  private servers: ServersFile;
  private configDir: string;
  private auth: AuthFile;
  private concurrency: number;
  private verbose: boolean;
  private showSecrets: boolean;
  private timeout: number;
  private maxRetries: number;

  constructor(opts: ServerManagerOptions) {
    this.servers = opts.servers;
    this.configDir = opts.configDir;
    this.auth = opts.auth;
    this.concurrency = opts.concurrency ?? 5;
    this.verbose = opts.verbose ?? false;
    this.showSecrets = opts.showSecrets ?? false;
    this.timeout = opts.timeout ?? 1_800_000;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  /** Get or create a connected client for a server */
  async getClient(serverName: string): Promise<Client> {
    const existing = this.clients.get(serverName);
    if (existing) return existing;

    // If a connection is already in flight, wait for it instead of opening a second one
    const inflight = this.connecting.get(serverName);
    if (inflight) return inflight;

    const config = this.servers.mcpServers[serverName];
    if (!config) {
      throw new Error(`Unknown server: "${serverName}"`);
    }

    const connectPromise = (async () => {
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
      await this.withTimeout(client.connect(transport), `connect(${serverName})`);
      this.clients.set(serverName, client);
      this.connecting.delete(serverName);

      return client;
    })().catch((err) => {
      this.connecting.delete(serverName);
      throw err;
    });

    this.connecting.set(serverName, connectPromise);
    return connectPromise;
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

  /** Race a promise against a timeout */
  private withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    if (this.timeout <= 0) return promise;
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label}: timed out after ${this.timeout / 1000}s`)),
          this.timeout,
        );
        timer.unref();
      }),
    ]);
  }

  /** Retry a function up to maxRetries times, clearing cached client between attempts */
  private async withRetry<T>(fn: () => Promise<T>, label: string, serverName?: string): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries && serverName) {
          // Clear cached client so next attempt reconnects fresh
          try {
            await this.clients.get(serverName)?.close();
          } catch {
            // ignore close errors
          }
          this.clients.delete(serverName);
          this.connecting.delete(serverName);
          this.transports.delete(serverName);
        }
      }
    }
    throw lastError;
  }

  /** List tools for a single server, applying allowedTools/disabledTools filters */
  async listTools(serverName: string): Promise<Tool[]> {
    return this.withRetry(
      async () => {
        const client = await this.getClient(serverName);
        const result = await this.withTimeout(client.listTools(), `listTools(${serverName})`);
        const config = this.servers.mcpServers[serverName]!;
        return filterTools(result.tools, config.allowedTools, config.disabledTools);
      },
      `listTools(${serverName})`,
      serverName,
    );
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
    return this.withRetry(
      async () => {
        const client = await this.getClient(serverName);
        return this.withTimeout(
          client.callTool({ name: toolName, arguments: args }),
          `callTool(${serverName}/${toolName})`,
        );
      },
      `callTool(${serverName}/${toolName})`,
      serverName,
    );
  }

  /** Get the schema for a specific tool */
  async getToolSchema(serverName: string, toolName: string): Promise<Tool | undefined> {
    const tools = await this.listTools(serverName);
    return tools.find((t) => t.name === toolName);
  }

  /** List resources for a single server */
  async listResources(serverName: string): Promise<Resource[]> {
    return this.withRetry(
      async () => {
        const client = await this.getClient(serverName);
        const result = await this.withTimeout(
          client.listResources(),
          `listResources(${serverName})`,
        );
        return result.resources;
      },
      `listResources(${serverName})`,
      serverName,
    );
  }

  /** List resources across all configured servers */
  async getAllResources(): Promise<{ resources: ResourceWithServer[]; errors: ServerError[] }> {
    const serverNames = Object.keys(this.servers.mcpServers);
    const resources: ResourceWithServer[] = [];
    const errors: ServerError[] = [];

    for (let i = 0; i < serverNames.length; i += this.concurrency) {
      const batch = serverNames.slice(i, i + this.concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(async (name) => {
          const serverResources = await this.listResources(name);
          return serverResources.map((resource) => ({ server: name, resource }));
        }),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j]!;
        if (result.status === "fulfilled") {
          resources.push(...result.value);
        } else {
          const name = batch[j]!;
          const message =
            result.reason instanceof Error ? result.reason.message : String(result.reason);
          errors.push({ server: name, message });
        }
      }
    }

    return { resources, errors };
  }

  /** Read a specific resource by URI */
  async readResource(serverName: string, uri: string): Promise<unknown> {
    return this.withRetry(
      async () => {
        const client = await this.getClient(serverName);
        return this.withTimeout(client.readResource({ uri }), `readResource(${serverName}/${uri})`);
      },
      `readResource(${serverName}/${uri})`,
      serverName,
    );
  }

  /** List prompts for a single server */
  async listPrompts(serverName: string): Promise<Prompt[]> {
    return this.withRetry(
      async () => {
        const client = await this.getClient(serverName);
        const result = await this.withTimeout(client.listPrompts(), `listPrompts(${serverName})`);
        return result.prompts;
      },
      `listPrompts(${serverName})`,
      serverName,
    );
  }

  /** List prompts across all configured servers */
  async getAllPrompts(): Promise<{ prompts: PromptWithServer[]; errors: ServerError[] }> {
    const serverNames = Object.keys(this.servers.mcpServers);
    const prompts: PromptWithServer[] = [];
    const errors: ServerError[] = [];

    for (let i = 0; i < serverNames.length; i += this.concurrency) {
      const batch = serverNames.slice(i, i + this.concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(async (name) => {
          const serverPrompts = await this.listPrompts(name);
          return serverPrompts.map((prompt) => ({ server: name, prompt }));
        }),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j]!;
        if (result.status === "fulfilled") {
          prompts.push(...result.value);
        } else {
          const name = batch[j]!;
          const message =
            result.reason instanceof Error ? result.reason.message : String(result.reason);
          errors.push({ server: name, message });
        }
      }
    }

    return { prompts, errors };
  }

  /** Get a specific prompt by name, optionally with arguments */
  async getPrompt(
    serverName: string,
    name: string,
    args?: Record<string, string>,
  ): Promise<unknown> {
    return this.withRetry(
      async () => {
        const client = await this.getClient(serverName);
        return this.withTimeout(
          client.getPrompt({ name, arguments: args }),
          `getPrompt(${serverName}/${name})`,
        );
      },
      `getPrompt(${serverName}/${name})`,
      serverName,
    );
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
    this.connecting.clear();
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
