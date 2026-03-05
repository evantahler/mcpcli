import type { Command } from "commander";
import { getContext } from "../context.ts";
import { formatServerTools, formatToolSchema, formatError } from "../output/formatter.ts";
import { startSpinner } from "../output/spinner.ts";

export function registerInfoCommand(program: Command) {
  program
    .command("info <server> [tool]")
    .description("show tools for a server, or schema for a specific tool")
    .action(async (server: string, tool: string | undefined) => {
      const { manager, formatOptions } = await getContext(program);
      const target = tool ? `${server}/${tool}` : server;
      const spinner = startSpinner(`Connecting to ${target}...`, formatOptions);
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
          const tools = await manager.listTools(server);
          spinner.stop();
          console.log(formatServerTools(server, tools, formatOptions));
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
