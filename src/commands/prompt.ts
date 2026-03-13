import type { Command } from "commander";
import { getContext } from "../context.ts";
import {
  formatPromptList,
  formatServerPrompts,
  formatPromptMessages,
  formatError,
} from "../output/formatter.ts";
import { logger } from "../output/logger.ts";
import { parseJsonArgs, readStdin } from "../lib/input.ts";

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
              args = parseJsonArgs(argsStr, { coerceToString: true }) as Record<string, string>;
            } else if (!process.stdin.isTTY) {
              const stdin = await readStdin();
              if (stdin.trim()) {
                args = parseJsonArgs(stdin, { coerceToString: true }) as Record<string, string>;
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
