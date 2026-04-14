import type {
	CallToolResult,
	CancelTaskResult,
	GetTaskResult,
	ListTasksResult,
} from "@modelcontextprotocol/sdk/types.js";
import type {
	PromptWithServer,
	ResourceWithServer,
	ServerError,
	ServerInfo,
	ServerManagerOptions,
	ToolWithServer,
} from "./client/manager.ts";
import { ServerManager } from "./client/manager.ts";
import { loadConfig } from "./config/loader.ts";
import type {
	AuthEntry,
	AuthFile,
	Config,
	HttpServerConfig,
	Prompt,
	Resource,
	SearchIndex,
	ServerConfig,
	ServersFile,
	StdioServerConfig,
	Tool,
} from "./config/schemas.ts";
import type { SearchOptions, SearchResult } from "./search/index.ts";
import { search } from "./search/index.ts";
import type { ValidationError, ValidationResult } from "./validation/schema.ts";
import { validateToolInput } from "./validation/schema.ts";

// Re-export types for SDK consumers
export type {
	AuthEntry,
	AuthFile,
	// MCP SDK types
	CallToolResult,
	CancelTaskResult,
	Config,
	GetTaskResult,
	HttpServerConfig,
	ListTasksResult,
	Prompt,
	PromptWithServer,
	Resource,
	ResourceWithServer,
	SearchIndex,
	SearchOptions,
	// Search types
	SearchResult,
	ServerConfig,
	ServerError,
	ServerInfo,
	ServersFile,
	StdioServerConfig,
	// Config types
	Tool,
	// Manager types
	ToolWithServer,
	ValidationError,
	// Validation types
	ValidationResult,
};

export interface McpxClientOptions {
	/** Path to config directory. Defaults to ~/.mcpx or MCP_CONFIG_PATH env var. */
	configDir?: string;
	/** Inline server config — bypasses file loading when provided. */
	servers?: ServersFile;
	/** Inline auth config — bypasses file loading when provided. */
	auth?: AuthFile;
	/** Inline search index — bypasses file loading when provided. */
	searchIndex?: SearchIndex;
	/** Max concurrent server connections. Default: 5 */
	concurrency?: number;
	/** Request timeout in ms. Default: 1_800_000 (30 min) */
	timeout?: number;
	/** Max retries per operation. Default: 3 */
	maxRetries?: number;
	/** Enable verbose/trace logging. Default: false */
	verbose?: boolean;
}

export class McpxClient {
	private options: McpxClientOptions;
	private manager: ServerManager | undefined;
	private searchIndex: SearchIndex | undefined;
	private connectPromise: Promise<void> | undefined;

	constructor(options: McpxClientOptions = {}) {
		this.options = options;
	}

	/** Ensure config is loaded and ServerManager is ready. Idempotent. */
	private async ensureConnected(): Promise<ServerManager> {
		if (this.manager) return this.manager;

		if (!this.connectPromise) {
			this.connectPromise = this.init();
		}
		await this.connectPromise;
		return this.manager!;
	}

	private async init(): Promise<void> {
		let servers: ServersFile;
		let auth: AuthFile;
		let configDir: string;
		let searchIndex: SearchIndex;

		if (this.options.servers) {
			// Inline config — no file loading
			servers = this.options.servers;
			auth = this.options.auth ?? {};
			configDir = this.options.configDir ?? "/tmp";
			searchIndex = this.options.searchIndex ?? {
				version: 1,
				indexed_at: "",
				embedding_model: "",
				tools: [],
			};
		} else {
			// Load from disk
			const config = await loadConfig({ configFlag: this.options.configDir });
			servers = config.servers;
			auth = config.auth;
			configDir = config.configDir;
			searchIndex = config.searchIndex;
		}

		this.searchIndex = searchIndex;

		const managerOpts: ServerManagerOptions = {
			servers,
			configDir,
			auth,
			concurrency: this.options.concurrency,
			verbose: this.options.verbose,
			timeout: this.options.timeout,
			maxRetries: this.options.maxRetries,
			logLevel: "emergency", // suppress server log messages from writing to stderr
			noInteractive: true, // agents can't fill elicitation forms
		};

		this.manager = new ServerManager(managerOpts);
	}

	// ---------------------------------------------------------------------------
	// Core workflow: search → info → exec
	// ---------------------------------------------------------------------------

	/** Search for tools by keyword and/or semantic similarity. Requires a pre-built index (run `mcpx index` via CLI). */
	async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
		await this.ensureConnected();
		if (!this.searchIndex || this.searchIndex.tools.length === 0) {
			throw new Error("No search index found. Build one with: mcpx index");
		}
		return search(query, this.searchIndex, options);
	}

	/** Get a tool's schema (name, description, inputSchema). */
	async info(server: string, tool: string): Promise<Tool | undefined> {
		const manager = await this.ensureConnected();
		return manager.getToolSchema(server, tool);
	}

	/** Execute a tool and return the result. */
	async exec(server: string, tool: string, args?: Record<string, unknown>): Promise<CallToolResult> {
		const manager = await this.ensureConnected();
		return manager.callTool(server, tool, args ?? {}) as Promise<CallToolResult>;
	}

	// ---------------------------------------------------------------------------
	// Tools
	// ---------------------------------------------------------------------------

	/** List tools, optionally filtered to a single server. */
	async listTools(server?: string): Promise<ToolWithServer[]> {
		const manager = await this.ensureConnected();
		if (server) {
			const tools = await manager.listTools(server);
			return tools.map((tool) => ({ server, tool }));
		}
		const { tools } = await manager.getAllTools();
		return tools;
	}

	// ---------------------------------------------------------------------------
	// Validation
	// ---------------------------------------------------------------------------

	/** Validate arguments against a tool's inputSchema. */
	async validateToolInput(server: string, toolName: string, args: Record<string, unknown>): Promise<ValidationResult> {
		const tool = await this.info(server, toolName);
		if (!tool) {
			return { valid: false, errors: [{ path: "(root)", message: `Tool not found: ${toolName}` }] };
		}
		return validateToolInput(server, tool, args);
	}

	// ---------------------------------------------------------------------------
	// Resources
	// ---------------------------------------------------------------------------

	/** List resources, optionally filtered to a single server. */
	async listResources(server?: string): Promise<ResourceWithServer[]> {
		const manager = await this.ensureConnected();
		if (server) {
			const resources = await manager.listResources(server);
			return resources.map((resource) => ({ server, resource }));
		}
		const { resources } = await manager.getAllResources();
		return resources;
	}

	/** Read a specific resource by URI. */
	async readResource(server: string, uri: string): Promise<unknown> {
		const manager = await this.ensureConnected();
		return manager.readResource(server, uri);
	}

	// ---------------------------------------------------------------------------
	// Prompts
	// ---------------------------------------------------------------------------

	/** List prompts, optionally filtered to a single server. */
	async listPrompts(server?: string): Promise<PromptWithServer[]> {
		const manager = await this.ensureConnected();
		if (server) {
			const prompts = await manager.listPrompts(server);
			return prompts.map((prompt) => ({ server, prompt }));
		}
		const { prompts } = await manager.getAllPrompts();
		return prompts;
	}

	/** Get a specific prompt by name, optionally with arguments. */
	async getPrompt(server: string, name: string, args?: Record<string, string>): Promise<unknown> {
		const manager = await this.ensureConnected();
		return manager.getPrompt(server, name, args);
	}

	// ---------------------------------------------------------------------------
	// Tasks
	// ---------------------------------------------------------------------------

	/** List tasks on a server. */
	async listTasks(server: string, cursor?: string): Promise<ListTasksResult> {
		const manager = await this.ensureConnected();
		return manager.listTasks(server, cursor);
	}

	/** Get the status of a task. */
	async getTask(server: string, taskId: string): Promise<GetTaskResult> {
		const manager = await this.ensureConnected();
		return manager.getTask(server, taskId);
	}

	/** Retrieve the result of a completed task. */
	async getTaskResult(server: string, taskId: string): Promise<CallToolResult> {
		const manager = await this.ensureConnected();
		return manager.getTaskResult(server, taskId);
	}

	/** Cancel a running task. */
	async cancelTask(server: string, taskId: string): Promise<CancelTaskResult> {
		const manager = await this.ensureConnected();
		return manager.cancelTask(server, taskId);
	}

	// ---------------------------------------------------------------------------
	// Server info
	// ---------------------------------------------------------------------------

	/** Get server info (version, capabilities, instructions). */
	async getServerInfo(server: string): Promise<ServerInfo> {
		const manager = await this.ensureConnected();
		return manager.getServerInfo(server);
	}

	/** Get all configured server names. */
	async getServerNames(): Promise<string[]> {
		const manager = await this.ensureConnected();
		return manager.getServerNames();
	}

	// ---------------------------------------------------------------------------
	// Lifecycle
	// ---------------------------------------------------------------------------

	/** Disconnect all servers and clean up. */
	async close(): Promise<void> {
		if (this.manager) {
			await this.manager.close();
			this.manager = undefined;
			this.connectPromise = undefined;
		}
	}
}
