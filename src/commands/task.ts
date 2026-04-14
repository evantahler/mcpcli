import type { Command } from "commander";
import {
	formatCallResult,
	formatError,
	formatTaskStatus,
	formatTasksList,
} from "../output/formatter.ts";
import { withCommand } from "./with-command.ts";

export function registerTaskCommand(program: Command) {
	program
		.command("task <action> <server> [taskId]")
		.description("manage tasks (actions: get, list, result, cancel)")
		.action(
			withCommand(
				program,
				{ spinnerText: "Connecting..." },
				async (
					{ manager, formatOptions, spinner },
					action: string,
					server: string,
					taskId?: string,
				) => {
					spinner.update(`Connecting to ${server}...`);

					switch (action) {
						case "list": {
							const result = await manager.listTasks(server);
							spinner.stop();
							console.log(formatTasksList(result.tasks, result.nextCursor, formatOptions));
							break;
						}
						case "get": {
							if (!taskId) {
								throw new Error("Usage: mcpx task get <server> <taskId>");
							}
							const task = await manager.getTask(server, taskId);
							spinner.stop();
							console.log(formatTaskStatus(task, formatOptions));
							break;
						}
						case "result": {
							if (!taskId) {
								throw new Error("Usage: mcpx task result <server> <taskId>");
							}
							const result = await manager.getTaskResult(server, taskId);
							spinner.stop();
							console.log(formatCallResult(result, formatOptions));
							break;
						}
						case "cancel": {
							if (!taskId) {
								throw new Error("Usage: mcpx task cancel <server> <taskId>");
							}
							const cancelled = await manager.cancelTask(server, taskId);
							spinner.stop();
							console.log(formatTaskStatus(cancelled, formatOptions));
							break;
						}
						default:
							throw new Error(`Unknown task action: "${action}". Use: get, list, result, cancel`);
					}
				},
			),
		);
}
