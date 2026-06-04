import type { Command } from "commander";
import type { ServerError, ToolWithServer } from "../client/manager.ts";
import type { Config } from "../config/schemas.ts";
import type { FormatOptions, UnifiedItem } from "../output/formatter.ts";
import { formatError, formatUnifiedList } from "../output/formatter.ts";
import { logger } from "../output/logger.ts";
import { maybeReindexDrift } from "../search/auto-reindex.ts";
import { withCommand } from "./with-command.ts";

export function registerListCommand(program: Command) {
	program.action(
		withCommand(
			program,
			{ spinnerText: "Connecting to servers...", errorLabel: "Failed to list servers" },
			async ({ config, manager, formatOptions, spinner }) => {
				const [toolsResult, resourcesResult, promptsResult] = await Promise.all([
					manager.getAllTools(),
					manager.getAllResources(),
					manager.getAllPrompts(),
				]);
				spinner.stop();

				// We already have every server's live tools — keep the search index fresh by
				// re-indexing any server whose tools have changed since it was last indexed.
				await refreshIndexOnDrift(config, toolsResult, formatOptions);

				const items: UnifiedItem[] = [
					...toolsResult.tools.map((t) => ({
						server: t.server,
						type: "tool" as const,
						name: t.tool.name,
						description: t.tool.description,
					})),
					...resourcesResult.resources.map((r) => ({
						server: r.server,
						type: "resource" as const,
						name: r.resource.uri,
						description: r.resource.description,
					})),
					...promptsResult.prompts.map((p) => ({
						server: p.server,
						type: "prompt" as const,
						name: p.prompt.name,
						description: p.prompt.description,
					})),
				];

				const typeOrder = { tool: 0, resource: 1, prompt: 2 };
				items.sort((a, b) => {
					if (a.server !== b.server) return a.server.localeCompare(b.server);
					if (a.type !== b.type) return typeOrder[a.type] - typeOrder[b.type];
					return a.name.localeCompare(b.name);
				});

				const errors = [...toolsResult.errors, ...resourcesResult.errors, ...promptsResult.errors];
				if (errors.length > 0) {
					const messagesByServer = new Map<string, Set<string>>();
					for (const err of errors) {
						let set = messagesByServer.get(err.server);
						if (!set) {
							set = new Set();
							messagesByServer.set(err.server, set);
						}
						set.add(err.message);
					}
					for (const [server, messages] of messagesByServer) {
						console.error(formatError(`Server "${server}": ${[...messages].join("; ")}`, formatOptions));
					}
					if (items.length > 0) console.log("");
				}

				console.log(formatUnifiedList(items, formatOptions));
			},
		),
	);
}

/** Refresh the search index for any server whose tools have drifted since the last index. */
async function refreshIndexOnDrift(
	config: Config,
	toolsResult: { tools: ToolWithServer[]; errors: ServerError[] },
	formatOptions: FormatOptions,
): Promise<void> {
	const spinner = logger.startSpinner("Refreshing search index...", formatOptions);
	try {
		const { servers } = await maybeReindexDrift(config, toolsResult.tools, toolsResult.errors, (p) => {
			spinner.update(`Re-indexing ${p.current}/${p.total}: ${p.tool}`);
		});
		spinner.stop();
		if (servers.length > 0) {
			logger.info(`Re-indexed tools for: ${servers.join(", ")} (changed since last index)`);
		}
	} catch (err) {
		// A drift refresh is best-effort; never let it break `list` output.
		spinner.stop();
		logger.warn(`Could not refresh search index: ${String(err)}`);
	}
}
