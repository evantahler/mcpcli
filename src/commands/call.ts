import type { Command } from "commander";
import { getContext } from "../context.ts";
import {
  formatCallResult,
  formatError,
  formatServerTools,
  formatValidationErrors,
} from "../output/formatter.ts";
import { logger } from "../output/logger.ts";
import { validateToolInput } from "../validation/schema.ts";

export function registerCallCommand(program: Command) {
  program
    .command("call <server> [tool] [args]")
    .description("execute a tool (omit tool name to list available tools)")
    .action(async (server: string, tool: string | undefined, argsStr: string | undefined) => {
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
        // Parse args from argument, stdin, or empty
        let args: Record<string, unknown> = {};

        if (argsStr) {
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

        const spinner = logger.startSpinner(`Calling ${server}/${tool}...`, formatOptions);
        const result = await manager.callTool(server, tool, args);
        spinner.stop();
        console.log(formatCallResult(result, formatOptions));
      } catch (err) {
        console.error(formatError(String(err), formatOptions));
        process.exit(1);
      } finally {
        await manager.close();
      }
    });
}

function parseJsonArgs(str: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Tool arguments must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${err.message}`);
    }
    throw err;
  }
}

async function readStdin(): Promise<string> {
  const chunks: string[] = [];
  const reader = process.stdin;
  reader.setEncoding("utf-8");
  for await (const chunk of reader) {
    chunks.push(chunk as string);
  }
  return chunks.join("");
}
