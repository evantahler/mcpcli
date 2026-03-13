import type { Command } from "commander";
import { getContext } from "../context.ts";
import {
  formatCallResult,
  formatError,
  formatServerTools,
  formatTaskCreated,
  formatValidationErrors,
} from "../output/formatter.ts";
import { logger } from "../output/logger.ts";
import { validateToolInput } from "../validation/schema.ts";
import { parseJsonArgs, readStdin } from "../lib/input.ts";

export function registerExecCommand(program: Command) {
  program
    .command("exec <server> [tool] [args]")
    .description("execute a tool (omit tool name to list available tools)")
    .option("-f, --file <path>", "read JSON args from a file")
    .option("--no-wait", "return task handle immediately without waiting for completion")
    .option("--ttl <ms>", "task TTL in milliseconds", "60000")
    .action(
      async (
        server: string,
        tool: string | undefined,
        argsStr: string | undefined,
        options: { file?: string; wait: boolean; ttl: string },
      ) => {
        const { manager, formatOptions } = await getContext(program);

        if (!tool) {
          try {
            const tools = await manager.listTools(server);
            console.log(formatServerTools(server, tools, formatOptions));
          } catch (err) {
            console.error(formatError(String(err), formatOptions));
            process.exit(1);
          } finally {
            await manager.close();
          }
          return;
        }
        try {
          // Error if both --file and positional arg provided
          if (options.file && argsStr) {
            throw new Error("Cannot specify both --file and inline JSON args");
          }

          // Parse args from: --file > positional arg > stdin > empty
          let args: Record<string, unknown> = {};

          if (options.file) {
            const file = Bun.file(options.file);
            if (!(await file.exists())) {
              throw new Error(`File not found: ${options.file}`);
            }
            const content = await file.text();
            args = parseJsonArgs(content);
          } else if (argsStr) {
            args = parseJsonArgs(argsStr);
          } else if (!process.stdin.isTTY) {
            // Read from stdin
            const stdin = await readStdin();
            if (stdin.trim()) {
              args = parseJsonArgs(stdin);
            }
          }

          // Validate args against tool inputSchema before calling
          const toolSchema = await manager.getToolSchema(server, tool);
          if (toolSchema) {
            const validation = validateToolInput(server, toolSchema, args);
            if (!validation.valid) {
              console.error(formatValidationErrors(server, tool, validation.errors, formatOptions));
              process.exit(1);
            }
          }

          // Check if tool supports task-augmented execution
          const taskSupport = (toolSchema as Record<string, unknown> | undefined)?.execution as
            | { taskSupport?: string }
            | undefined;
          const supportsTask = await manager.serverSupportsTask(server);
          const useTask =
            supportsTask &&
            taskSupport?.taskSupport !== undefined &&
            taskSupport.taskSupport !== "forbidden";

          if (useTask) {
            const abortController = new AbortController();
            let currentTaskId: string | undefined;

            // Graceful Ctrl+C: cancel the task before exiting
            const sigintHandler = async () => {
              abortController.abort();
              if (currentTaskId) {
                try {
                  await manager.cancelTask(server, currentTaskId);
                } catch {
                  // best effort
                }
              }
              await manager.close();
              process.exit(130);
            };
            process.on("SIGINT", sigintHandler);

            const spinner = logger.startSpinner(`Executing ${server}/${tool}...`, formatOptions);
            try {
              const stream = manager.callToolStream(server, tool, args, {
                ttl: parseInt(options.ttl, 10),
                signal: abortController.signal,
              });

              for await (const message of stream) {
                switch (message.type) {
                  case "taskCreated":
                    currentTaskId = message.task.taskId;
                    if (!options.wait) {
                      // --no-wait: output the task handle and exit
                      spinner.stop();
                      console.log(formatTaskCreated(message.task, formatOptions));
                      return;
                    }
                    spinner.update(`Task ${message.task.taskId} (${message.task.status})...`);
                    break;
                  case "taskStatus":
                    spinner.update(`Task ${message.task.taskId} (${message.task.status})...`);
                    break;
                  case "result":
                    spinner.stop();
                    console.log(formatCallResult(message.result, formatOptions));
                    return;
                  case "error":
                    spinner.error("Task failed");
                    throw message.error;
                }
              }
            } finally {
              process.removeListener("SIGINT", sigintHandler);
            }
          } else {
            // Standard synchronous tool call
            const spinner = logger.startSpinner(`Executing ${server}/${tool}...`, formatOptions);
            const result = await manager.callTool(server, tool, args);
            spinner.stop();
            console.log(formatCallResult(result, formatOptions));
          }
        } catch (err) {
          console.error(formatError(String(err), formatOptions));
          process.exit(1);
        } finally {
          await manager.close();
        }
      },
    );
}
