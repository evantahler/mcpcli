import type { Command } from "commander";
import type { Prompt, Resource, Tool } from "../config/schemas.ts";
import { formatError, formatServerOverview, formatToolSchema } from "../output/formatter.ts";
import { withCommand } from "./with-command.ts";

export function registerInfoCommand(program: Command) {
	program
		.command("info <server> [tool]")
		.description("show server overview, or schema for a specific tool")
		.action(
			withCommand(
				program,
				{ spinnerText: "Connecting..." },
				async ({ manager, formatOptions, spinner }, server: string, tool?: string) => {
					const target = tool ? `${server}/${tool}` : server;
					spinner.update(`Connecting to ${target}...`);

					if (tool) {
						const toolSchema = await manager.getToolSchema(server, tool);
						spinner.stop();
						if (!toolSchema) {
							console.error(formatError(`Tool "${tool}" not found on server "${server}"`, formatOptions));
							process.exit(1);
						}
						console.log(formatToolSchema(server, toolSchema, formatOptions));
					} else {
						const serverInfo = await manager.getServerInfo(server);
						const caps = serverInfo.capabilities as Record<string, unknown> | undefined;

						const fetches: [Promise<Tool[]>, Promise<Resource[]>, Promise<Prompt[]>] = [
							caps?.tools !== undefined ? manager.listTools(server) : Promise.resolve([]),
							caps?.resources !== undefined ? manager.listResources(server) : Promise.resolve([]),
							caps?.prompts !== undefined ? manager.listPrompts(server) : Promise.resolve([]),
						];
						const [tools, resources, prompts] = await Promise.all(fetches);

						spinner.stop();
						console.log(
							formatServerOverview(
								{
									serverName: server,
									version: serverInfo.version,
									capabilities: caps,
									instructions: serverInfo.instructions,
									tools,
									resourceCount: resources.length,
									promptCount: prompts.length,
								},
								formatOptions,
							),
						);
					}
				},
			),
		);
}
