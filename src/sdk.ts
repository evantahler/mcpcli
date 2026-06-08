import type {
	CallToolResult,
	CancelTaskResult,
	GetTaskResult,
	ListTasksResult,
	ToolAnnotations,
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
	// MCP tool annotations (readOnlyHint, destructiveHint, idempotentHint, openWorldHint, title)
	ToolAnnotations,
	// Manager types
	ToolWithServer,
	ValidationError,
	// Validation types
	ValidationResult,
};

// ---------------------------------------------------------------------------
// Human-in-the-loop approval gate
//
// MCP tools carry optional `annotations` (readOnlyHint, destructiveHint,
// idempotentHint, openWorldHint). SDK consumers can require a human/approval
// callback before executing tools that match a policy — e.g. "open-world
// writeable" tools. Per the MCP spec these annotations are *untrusted hints*:
// "Clients should never make tool use decisions based on ToolAnnotations
// received from untrusted servers." Treat this gate as a guardrail, not a
// security boundary.
// ---------------------------------------------------------------------------

/** Built-in classification presets for which tools require approval. */
export type ApprovalPolicyPreset =
	| "none" // default — nothing is gated (back-compat)
	| "open-world-writeable" // openWorldHint === true AND readOnlyHint !== true
	| "writeable" // readOnlyHint !== true (also gates unannotated tools)
	| "all"; // every exec is gated

/**
 * Custom classifier. Return true to require approval for this tool.
 * `tool` is the raw MCP Tool (its `annotations` may be undefined).
 */
export type ApprovalPredicate = (tool: Tool, server: string) => boolean;

/** A preset, a custom predicate, or an array of either combined with OR. */
export type ApprovalPolicy = ApprovalPolicyPreset | ApprovalPredicate | Array<ApprovalPolicyPreset | ApprovalPredicate>;

/** Passed to the approval callback describing the pending tool call. */
export interface ToolApprovalRequest {
	server: string;
	tool: string;
	/** Arguments exec() was called with (after defaulting to {}). */
	args: Record<string, unknown>;
	/** The full resolved Tool schema, including annotations. */
	schema: Tool;
	/** Convenience accessor for schema.annotations (may be undefined). */
	annotations: ToolAnnotations | undefined;
	/** Which preset/predicate flagged this call, for logging. */
	reason: string;
}

/** Approval callback. Return true to allow, false to deny. May be async. */
export type ToolApprovalCallback = (request: ToolApprovalRequest) => boolean | Promise<boolean>;

/** Thrown when a tool is gated but no onApprovalRequired callback was supplied. */
export class ToolApprovalRequiredError extends Error {
	readonly server: string;
	readonly tool: string;
	constructor(server: string, tool: string) {
		super(
			`Tool "${server}/${tool}" requires human approval, but no onApprovalRequired callback was provided. ` +
				`Supply McpxClientOptions.onApprovalRequired, or set approvalPolicy to "none".`,
		);
		this.name = "ToolApprovalRequiredError";
		this.server = server;
		this.tool = tool;
	}
}

/** Thrown when the approval callback denies a gated tool call. */
export class ToolApprovalDeniedError extends Error {
	readonly server: string;
	readonly tool: string;
	constructor(server: string, tool: string) {
		super(`Execution of "${server}/${tool}" was denied by the approval callback.`);
		this.name = "ToolApprovalDeniedError";
		this.server = server;
		this.tool = tool;
	}
}

/**
 * True when a tool is annotated as interacting with an "open world" of external
 * entities AND is not marked read-only. Fail-permissive: tools with no
 * `openWorldHint` are NOT considered open-world (absence of a hint is not an
 * affirmative mark).
 */
export function isOpenWorldWriteable(tool: Tool): boolean {
	const a = tool.annotations;
	return a?.openWorldHint === true && a?.readOnlyHint !== true;
}

/**
 * True when a tool is not explicitly marked read-only. Fail-safe: tools with no
 * annotations ARE considered writeable.
 */
export function isWriteable(tool: Tool): boolean {
	return tool.annotations?.readOnlyHint !== true;
}

/** Resolve a single preset/predicate into a matcher with a human-readable reason label. */
function presetMatcher(p: ApprovalPolicyPreset | ApprovalPredicate): { reason: string; match: ApprovalPredicate } {
	if (typeof p === "function") return { reason: "custom-predicate", match: p };
	switch (p) {
		case "open-world-writeable":
			return { reason: "open-world-writeable", match: isOpenWorldWriteable };
		case "writeable":
			return { reason: "writeable", match: isWriteable };
		case "all":
			return { reason: "all", match: () => true };
		default:
			return { reason: "none", match: () => false };
	}
}

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
	/**
	 * Which tools require human approval before exec(). Default: "none".
	 * A preset string, a custom predicate, or an array of either (OR-combined).
	 */
	approvalPolicy?: ApprovalPolicy;
	/**
	 * Async callback invoked when a gated tool is about to run. Return false to
	 * deny (exec() throws ToolApprovalDeniedError). Required whenever
	 * approvalPolicy gates anything — if a gated tool is reached without a
	 * callback, exec() throws ToolApprovalRequiredError.
	 */
	onApprovalRequired?: ToolApprovalCallback;
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
		const callArgs = args ?? {};

		// Fast path: when no approval policy can gate anything, run the tool
		// directly — no extra schema fetch, identical to pre-gate behavior.
		if (!this.isApprovalActive()) {
			return manager.callTool(server, tool, callArgs) as Promise<CallToolResult>;
		}

		// Policy is active — resolve the schema once to classify the tool.
		const schema = await manager.getToolSchema(server, tool);
		// Unknown tool: defer to callTool so the canonical error surfaces (don't mask it).
		if (schema) {
			const reason = this.classify(schema, server);
			if (reason) {
				if (!this.options.onApprovalRequired) {
					throw new ToolApprovalRequiredError(server, tool);
				}
				const approved = await this.options.onApprovalRequired({
					server,
					tool,
					args: callArgs,
					schema,
					annotations: schema.annotations,
					reason,
				});
				if (!approved) throw new ToolApprovalDeniedError(server, tool);
			}
		}

		return manager.callTool(server, tool, callArgs) as Promise<CallToolResult>;
	}

	/** True when approvalPolicy could gate at least one tool. */
	private isApprovalActive(): boolean {
		const policy = this.options.approvalPolicy;
		if (policy === undefined) return false;
		const entries = Array.isArray(policy) ? policy : [policy];
		return entries.some((p) => p !== "none");
	}

	/** Classify a tool against the policy. Returns the matching reason, or undefined if not gated. */
	private classify(tool: Tool, server: string): string | undefined {
		const policy = this.options.approvalPolicy;
		if (policy === undefined) return undefined;
		const entries = Array.isArray(policy) ? policy : [policy];
		for (const entry of entries) {
			const { reason, match } = presetMatcher(entry);
			if (match(tool, server)) return reason;
		}
		return undefined;
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
