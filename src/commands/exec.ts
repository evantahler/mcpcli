import { UrlElicitationRequiredError } from "@modelcontextprotocol/sdk/types.js";
import type { Command } from "commander";
import { handleUrlElicitation } from "../client/elicitation.ts";
import type { ServerManager } from "../client/manager.ts";
import { DEFAULTS } from "../constants.ts";
import { getContext } from "../context.ts";
import { parseJsonArgs, parseShellArgs, readStdin } from "../lib/input.ts";
import {
	formatCallResult,
	formatError,
	formatServerTools,
	formatTaskCreated,
	formatValidationErrors,
} from "../output/formatter.ts";
import { logger } from "../output/logger.ts";
import { ExitError } from "../shutdown.ts";
import { validateToolInput } from "../validation/schema.ts";

type ResolvedArgs =
	| { mode: "list-tools"; server: string }
	| {
			mode: "call-tool";
			server: string;
			tool: string;
			rest: string[];
	  };

/**
 * Resolve the positional args into either list-tools or call-tool mode.
 * Supports both `exec <server> <tool> [args]` and `exec <tool> [args]`.
 *
 * `rest` is whatever positional tokens remain after `<server> <tool>`. It may contain
 * a single inline JSON string, or shell-flag tokens (after `--`), or be empty.
 */
async function resolveExecArgs(
	manager: ServerManager,
	first: string,
	second: string | undefined,
	rest: string[],
): Promise<ResolvedArgs> {
	const serverNames = manager.getServerNames();
	const isServer = serverNames.includes(first);

	if (isServer) {
		// Traditional form: exec <server> [tool] [args]
		if (!second) {
			return { mode: "list-tools", server: first };
		}

		// Validate the tool exists on the specified server
		const serverTools = await manager.listTools(first);
		const toolExists = serverTools.some((t) => t.name === second);

		if (!toolExists) {
			const { tools } = await manager.getAllTools();
			const matches = tools.filter((t) => t.tool.name === second);

			if (matches.length === 1) {
				throw new Error(
					`Tool "${second}" not found on server "${first}". Did you mean:\n  mcpx exec ${matches[0]?.server} ${second}`,
				);
			} else if (matches.length > 1) {
				const servers = matches.map((m) => m.server).join(", ");
				throw new Error(
					`Tool "${second}" not found on server "${first}". Found on: ${servers}\nUsage: mcpx exec <server> ${second} [args]`,
				);
			} else {
				throw new Error(
					`Tool "${second}" not found on server "${first}". Run "mcpx search ${second}" to find similar tools.`,
				);
			}
		}

		return { mode: "call-tool", server: first, tool: second, rest };
	}

	// Not a server name — treat first as a tool name; `second` is the start of `rest`.
	const toolName = first;
	const { tools } = await manager.getAllTools();
	const matches = tools.filter((t) => t.tool.name === toolName);

	if (matches.length === 0) {
		throw new Error(`Unknown server or tool "${first}". Run "mcpx search ${first}" to find similar tools.`);
	}

	if (matches.length > 1) {
		const servers = matches.map((m) => m.server).join(", ");
		throw new Error(
			`Ambiguous tool "${toolName}" — found on multiple servers: ${servers}\nSpecify the server: mcpx exec <server> ${toolName} [args]`,
		);
	}

	const fullRest = second === undefined ? rest : [second, ...rest];
	return { mode: "call-tool", server: matches[0]!.server, tool: toolName, rest: fullRest };
}

export function registerExecCommand(program: Command) {
	program
		.command("exec <server> [tool] [args...]")
		.description(
			"execute a tool. server may be omitted if the tool name is unambiguous: `mcpx exec <tool> [args...]`. " +
				"args may be a single JSON object string, or shell flags after `--` (e.g. `-- --field value`).",
		)
		.option("-f, --file <path>", "read JSON args from a file")
		.option("--no-wait", "return task handle immediately without waiting for completion")
		.option("--ttl <ms>", "task TTL in milliseconds", String(DEFAULTS.TASK_TTL_MS))
		.action(
			async (
				serverOrTool: string,
				toolOrFirstArg: string | undefined,
				trailing: string[],
				options: { file?: string; wait: boolean; ttl: string },
			) => {
				const { manager, formatOptions, noInteractive } = await getContext(program);

				let resolved: ResolvedArgs;
				try {
					resolved = await resolveExecArgs(manager, serverOrTool, toolOrFirstArg, trailing);
				} catch (err) {
					console.error(formatError(String(err), formatOptions));
					await manager.close();
					process.exit(1);
				}

				if (resolved.mode === "list-tools") {
					try {
						const tools = await manager.listTools(resolved.server);
						console.log(formatServerTools(resolved.server, tools, formatOptions));
					} catch (err) {
						console.error(formatError(String(err), formatOptions));
						process.exit(1);
					} finally {
						await manager.close();
					}
					return;
				}

				const { server, tool, rest } = resolved;

				try {
					// Classify the trailing positional tokens. If the first one starts with `--`
					// it's the shell-flag form; otherwise, treat a single token as inline JSON.
					const isShellFlagForm = rest.length > 0 && rest[0]!.startsWith("--");
					const argsStr = !isShellFlagForm && rest.length === 1 ? rest[0] : undefined;
					const shellTokens = isShellFlagForm ? rest : [];

					// More than one positional token without `--` flag prefix is ambiguous.
					if (!isShellFlagForm && rest.length > 1) {
						throw new Error("Cannot mix inline JSON args with shell flags — use one form");
					}

					// Conflict checks
					if (options.file && argsStr) {
						throw new Error("Cannot specify both --file and inline JSON args");
					}
					if (shellTokens.length > 0 && options.file) {
						throw new Error("Cannot mix `--` shell flags with --file");
					}

					// Fetch the tool schema once, up front, so shell-flag parsing can use it for type coercion.
					const toolSchema = await manager.getToolSchema(server, tool);

					// Parse args from: --file > inline JSON positional > shell flags after `--` > stdin > empty
					let args: Record<string, unknown> = {};

					if (options.file) {
						const file = Bun.file(options.file);
						if (!(await file.exists())) {
							throw new Error(`File not found: ${options.file}`);
						}
						const content = await file.text();
						args = parseJsonArgs(content);
					} else if (argsStr) {
						args = parseJsonArgs(argsStr);
					} else if (shellTokens.length > 0) {
						args = parseShellArgs(shellTokens, toolSchema?.inputSchema);
					} else if (!process.stdin.isTTY) {
						// Read from stdin
						const stdin = await readStdin();
						if (stdin.trim()) {
							args = parseJsonArgs(stdin);
						}
					}

					// Validate args against tool inputSchema before calling
					if (toolSchema) {
						const validation = validateToolInput(server, toolSchema, args);
						if (!validation.valid) {
							console.error(formatValidationErrors(server, tool, validation.errors, formatOptions));
							process.exit(1);
						}
					}

					// Check if tool supports task-augmented execution
					const taskSupport = (toolSchema as Record<string, unknown> | undefined)?.execution as
						| { taskSupport?: string }
						| undefined;
					const supportsTask = await manager.serverSupportsTask(server);
					const useTask =
						supportsTask && taskSupport?.taskSupport !== undefined && taskSupport.taskSupport !== "forbidden";

					if (useTask) {
						const abortController = new AbortController();
						let currentTaskId: string | undefined;

						// Graceful Ctrl+C: cancel the task before exiting
						const sigintHandler = async () => {
							abortController.abort();
							if (currentTaskId) {
								try {
									await manager.cancelTask(server, currentTaskId);
								} catch {
									// best effort
								}
							}
							await manager.close();
							process.exit(130);
						};
						process.on("SIGINT", sigintHandler);

						const spinner = logger.startSpinner(`Executing ${server}/${tool}...`, formatOptions);
						try {
							const stream = manager.callToolStream(server, tool, args, {
								ttl: parseInt(options.ttl, 10),
								signal: abortController.signal,
							});

							for await (const message of stream) {
								switch (message.type) {
									case "taskCreated":
										currentTaskId = message.task.taskId;
										if (!options.wait) {
											// --no-wait: output the task handle and exit
											spinner.stop();
											console.log(formatTaskCreated(message.task, formatOptions));
											return;
										}
										spinner.update(`Task ${message.task.taskId} (${message.task.status})...`);
										break;
									case "taskStatus":
										spinner.update(`Task ${message.task.taskId} (${message.task.status})...`);
										break;
									case "result":
										spinner.stop();
										console.log(formatCallResult(message.result, formatOptions));
										return;
									case "error":
										spinner.error("Task failed");
										throw message.error;
								}
							}
						} finally {
							process.removeListener("SIGINT", sigintHandler);
						}
					} else {
						// Standard synchronous tool call
						const spinner = logger.startSpinner(`Executing ${server}/${tool}...`, formatOptions);
						let result: unknown;
						try {
							result = await manager.callTool(server, tool, args);
						} finally {
							spinner.stop();
						}
						console.log(formatCallResult(result, formatOptions));
					}
				} catch (err) {
					if (err instanceof UrlElicitationRequiredError) {
						const elicitOptions = { noInteractive, json: !!formatOptions.json };
						for (const elicitation of err.elicitations) {
							await handleUrlElicitation(elicitation, elicitOptions);
						}
						throw new ExitError(1);
					}
					console.error(formatError(String(err), formatOptions));
					throw new ExitError(1);
				} finally {
					await manager.close();
				}
			},
		);
}
