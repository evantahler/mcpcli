import type { Command } from "commander";
import { getContext } from "../context.ts";
import { formatToolList, formatError } from "../output/formatter.ts";
import { logger } from "../output/logger.ts";

export function registerListCommand(program: Command) {
  program.action(async () => {
    const { manager, formatOptions } = await getContext(program);
    const spinner = logger.startSpinner("Connecting to servers...", formatOptions);
    try {
      const { tools, errors } = await manager.getAllTools();
      spinner.stop();

      if (errors.length > 0) {
        for (const err of errors) {
          console.error(`"${err.server}": ${err.message}`);
        }
        if (tools.length > 0) console.log("");
      }

      console.log(formatToolList(tools, formatOptions));
    } catch (err) {
      spinner.error("Failed to list tools");
      console.error(formatError(String(err), formatOptions));
      process.exit(1);
    } finally {
      await manager.close();
    }
  });
}
