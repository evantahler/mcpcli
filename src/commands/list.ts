import type { Command } from "commander";
import { getContext } from "../context.ts";
import { formatToolList, formatError } from "../output/formatter.ts";

export function registerListCommand(program: Command) {
  program.action(async () => {
    const { manager, formatOptions } = await getContext(program);
    try {
      const tools = await manager.getAllTools();
      console.log(formatToolList(tools, formatOptions));
    } catch (err) {
      console.error(formatError(String(err), formatOptions));
      process.exit(1);
    } finally {
      await manager.close();
    }
  });
}
