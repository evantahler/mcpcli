import type { Command } from "commander";
import { getContext } from "../context.ts";
import { formatToolList, formatError } from "../output/formatter.ts";
import { startSpinner } from "../output/spinner.ts";

export function registerListCommand(program: Command) {
  program.action(async () => {
    const { manager, formatOptions } = await getContext(program);
    const spinner = startSpinner("Connecting to servers...", formatOptions);
    try {
      const tools = await manager.getAllTools();
      spinner.stop();
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
