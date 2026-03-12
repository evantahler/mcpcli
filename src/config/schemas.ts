import type { Tool, Resource, Prompt } from "@modelcontextprotocol/sdk/types.js";
import type {
  OAuthTokens,
  OAuthClientInformation,
  OAuthClientInformationMixed,
} from "@modelcontextprotocol/sdk/shared/auth.js";

// Re-export SDK types we use throughout the codebase
export type {
  Tool,
  Resource,
  Prompt,
  OAuthTokens,
  OAuthClientInformation,
  OAuthClientInformationMixed,
};

// --- Server config (our format, not MCP spec) ---

/** Stdio MCP server config */
export interface StdioServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  allowedTools?: string[];
  disabledTools?: string[];
}

/** HTTP MCP server config */
export interface HttpServerConfig {
  url: string;
  headers?: Record<string, string>;
  transport?: "sse" | "streamable-http";
  allowedTools?: string[];
  disabledTools?: string[];
}

export type ServerConfig = StdioServerConfig | HttpServerConfig;

export function isStdioServer(config: ServerConfig): config is StdioServerConfig {
  return "command" in config;
}

export function isHttpServer(config: ServerConfig): config is HttpServerConfig {
  return "url" in config;
}

/** Top-level servers.json shape */
export interface ServersFile {
  mcpServers: Record<string, ServerConfig>;
}

// --- Auth storage (wraps SDK's OAuthTokens with our persistence fields) ---

/** Per-server auth entry stored in auth.json */
export interface AuthEntry {
  tokens: OAuthTokens;
  expires_at?: string;
  client_info?: OAuthClientInformationMixed;
  complete?: boolean;
}

/** Top-level auth.json shape */
export type AuthFile = Record<string, AuthEntry>;

// --- Search index (entirely our format) ---

/** A single tool entry in the search index */
export interface IndexedTool {
  server: string;
  tool: string;
  description: string;
  input_schema?: Tool["inputSchema"];
  scenarios: string[];
  keywords: string[];
  embedding: number[];
}

/** Top-level search.json shape */
export interface SearchIndex {
  version: number;
  indexed_at: string;
  embedding_model: string;
  tools: IndexedTool[];
}

// --- Combined config ---

/** Validated config returned by loadConfig */
export interface Config {
  configDir: string;
  servers: ServersFile;
  auth: AuthFile;
  searchIndex: SearchIndex;
}

// --- Validation ---

/** Validate that a parsed object looks like a valid servers.json */
export function validateServersFile(data: unknown): ServersFile {
  if (typeof data !== "object" || data === null) {
    throw new Error("servers.json must be a JSON object");
  }

  const obj = data as Record<string, unknown>;
  if (typeof obj.mcpServers !== "object" || obj.mcpServers === null) {
    throw new Error('servers.json must have a "mcpServers" object');
  }

  const servers = obj.mcpServers as Record<string, unknown>;
  for (const [name, config] of Object.entries(servers)) {
    if (typeof config !== "object" || config === null) {
      throw new Error(`Server "${name}" must be an object`);
    }
    const c = config as Record<string, unknown>;
    const hasCommand = typeof c.command === "string";
    const hasUrl = typeof c.url === "string";
    if (!hasCommand && !hasUrl) {
      throw new Error(`Server "${name}" must have either "command" (stdio) or "url" (http)`);
    }
    if (hasUrl && c.transport !== undefined) {
      if (c.transport !== "sse" && c.transport !== "streamable-http") {
        throw new Error(
          `Server "${name}" has invalid transport "${c.transport}" — must be "sse" or "streamable-http"`,
        );
      }
    }
  }

  return data as ServersFile;
}

/** Validate auth.json — lenient, just check shape */
export function validateAuthFile(data: unknown): AuthFile {
  if (typeof data !== "object" || data === null) {
    throw new Error("auth.json must be a JSON object");
  }
  return data as AuthFile;
}

/** Validate search.json — lenient, just check shape */
export function validateSearchIndex(data: unknown): SearchIndex {
  if (typeof data !== "object" || data === null) {
    throw new Error("search.json must be a JSON object");
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.tools)) {
    throw new Error('search.json must have a "tools" array');
  }
  return data as SearchIndex;
}
