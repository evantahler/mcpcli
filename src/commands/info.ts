import type { Command } from "commander";
import { getContext } from "../context.ts";
import { formatServerTools, formatToolSchema, formatError } from "../output/formatter.ts";
import { startSpinner } from "../output/spinner.ts";

export function registerInfoCommand(program: Command) {
  program
    .command("info <target>")
    .description("show tools for a server, or schema for a specific tool")
    .action(async (target: string) => {
      const { manager, formatOptions } = await getContext(program);
      const spinner = startSpinner(`Connecting to ${target}...`, formatOptions);
      try {
        // Parse "server/tool" or "server tool" format
        const slashIndex = target.indexOf("/");
        if (slashIndex !== -1) {
          const serverName = target.slice(0, slashIndex);
          const toolName = target.slice(slashIndex + 1);
          const tool = await manager.getToolSchema(serverName, toolName);
          spinner.stop();
          if (!tool) {
            console.error(
              formatError(`Tool "${toolName}" not found on server "${serverName}"`, formatOptions),
            );
            process.exit(1);
          }
          console.log(formatToolSchema(serverName, tool, formatOptions));
        } else {
          // Just a server name — list its tools
          const tools = await manager.listTools(target);
          spinner.stop();
          console.log(formatServerTools(target, tools, formatOptions));
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
