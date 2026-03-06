import type { Command } from "commander";
import { getContext } from "../context.ts";
import {
  formatPromptList,
  formatServerPrompts,
  formatPromptMessages,
  formatError,
} from "../output/formatter.ts";
import { logger } from "../output/logger.ts";

export function registerPromptCommand(program: Command) {
  program
    .command("prompt [server] [name] [args]")
    .description("list prompts for a server, or get a specific prompt")
    .action(
      async (server: string | undefined, name: string | undefined, argsStr: string | undefined) => {
        const { manager, formatOptions } = await getContext(program);
        const spinner = logger.startSpinner(
          server ? `Connecting to ${server}...` : "Connecting to servers...",
          formatOptions,
        );
        try {
          if (server && name) {
            let args: Record<string, string> | undefined;

            if (argsStr) {
              args = parseJsonArgs(argsStr);
            } else if (!process.stdin.isTTY) {
              const stdin = await readStdin();
              if (stdin.trim()) {
                args = parseJsonArgs(stdin);
              }
            }

            const result = await manager.getPrompt(server, name, args);
            spinner.stop();
            console.log(formatPromptMessages(server, name, result, formatOptions));
          } else if (server) {
            const prompts = await manager.listPrompts(server);
            spinner.stop();
            console.log(formatServerPrompts(server, prompts, formatOptions));
          } else {
            const { prompts, errors } = await manager.getAllPrompts();
            spinner.stop();
            console.log(formatPromptList(prompts, formatOptions));
            for (const err of errors) {
              console.error(formatError(`${err.server}: ${err.message}`, formatOptions));
            }
          }
        } catch (err) {
          spinner.error("Failed");
          console.error(formatError(String(err), formatOptions));
          process.exit(1);
        } finally {
          await manager.close();
        }
      },
    );
}

function parseJsonArgs(str: string): Record<string, string> {
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Prompt arguments must be a JSON object");
    }
    // Coerce all values to strings (MCP prompt args are Record<string, string>)
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
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
