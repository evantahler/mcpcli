import type { Command } from "commander";
import type { Tool, Resource, Prompt } from "../config/schemas.ts";
import { getContext } from "../context.ts";
import { formatServerOverview, formatToolSchema, formatError } from "../output/formatter.ts";
import { logger } from "../output/logger.ts";

export function registerInfoCommand(program: Command) {
  program
    .command("info <server> [tool]")
    .description("show server overview, or schema for a specific tool")
    .action(async (server: string, tool: string | undefined) => {
      const { manager, formatOptions } = await getContext(program);
      const target = tool ? `${server}/${tool}` : server;
      const spinner = logger.startSpinner(`Connecting to ${target}...`, formatOptions);
      try {
        if (tool) {
          const toolSchema = await manager.getToolSchema(server, tool);
          spinner.stop();
          if (!toolSchema) {
            console.error(
              formatError(`Tool "${tool}" not found on server "${server}"`, formatOptions),
            );
            process.exit(1);
          }
          console.log(formatToolSchema(server, toolSchema, formatOptions));
        } else {
          // Get server info first to check capabilities
          const serverInfo = await manager.getServerInfo(server);
          const caps = serverInfo.capabilities as Record<string, unknown> | undefined;

          // Only fetch what the server supports
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
      } catch (err) {
        spinner.error(`Failed to connect to ${target}`);
        console.error(formatError(String(err), formatOptions));
        process.exit(1);
      } finally {
        await manager.close();
      }
    });
}
