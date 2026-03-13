import type { Command } from "commander";
import { getContext } from "../context.ts";
import {
  formatCallResult,
  formatError,
  formatTaskStatus,
  formatTasksList,
} from "../output/formatter.ts";
import { logger } from "../output/logger.ts";

export function registerTaskCommand(program: Command) {
  program
    .command("task <action> <server> [taskId]")
    .description("manage tasks (actions: get, list, result, cancel)")
    .action(async (action: string, server: string, taskId: string | undefined) => {
      const { manager, formatOptions } = await getContext(program);
      const spinner = logger.startSpinner(`Connecting to ${server}...`, formatOptions);

      try {
        switch (action) {
          case "list": {
            const result = await manager.listTasks(server);
            spinner.stop();
            console.log(formatTasksList(result.tasks, result.nextCursor, formatOptions));
            break;
          }
          case "get": {
            if (!taskId) {
              spinner.error("Missing task ID");
              console.error(formatError("Usage: mcpx task get <server> <taskId>", formatOptions));
              process.exit(1);
            }
            const task = await manager.getTask(server, taskId);
            spinner.stop();
            console.log(formatTaskStatus(task, formatOptions));
            break;
          }
          case "result": {
            if (!taskId) {
              spinner.error("Missing task ID");
              console.error(
                formatError("Usage: mcpx task result <server> <taskId>", formatOptions),
              );
              process.exit(1);
            }
            const result = await manager.getTaskResult(server, taskId);
            spinner.stop();
            console.log(formatCallResult(result, formatOptions));
            break;
          }
          case "cancel": {
            if (!taskId) {
              spinner.error("Missing task ID");
              console.error(
                formatError("Usage: mcpx task cancel <server> <taskId>", formatOptions),
              );
              process.exit(1);
            }
            const cancelled = await manager.cancelTask(server, taskId);
            spinner.stop();
            console.log(formatTaskStatus(cancelled, formatOptions));
            break;
          }
          default:
            spinner.error("Unknown action");
            console.error(
              formatError(
                `Unknown task action: "${action}". Use: get, list, result, cancel`,
                formatOptions,
              ),
            );
            process.exit(1);
        }
      } catch (err) {
        spinner.error("Failed");
        console.error(formatError(String(err), formatOptions));
        process.exit(1);
      } finally {
        await manager.close();
      }
    });
}
