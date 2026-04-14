import type { Command } from "commander";
import { parseJsonArgs, readStdin } from "../lib/input.ts";
import {
	formatError,
	formatPromptList,
	formatPromptMessages,
	formatServerPrompts,
} from "../output/formatter.ts";
import { withCommand } from "./with-command.ts";

export function registerPromptCommand(program: Command) {
	program
		.command("prompt [server] [name] [args]")
		.description("list prompts for a server, or get a specific prompt")
		.action(
			withCommand(
				program,
				{ spinnerText: "Connecting to servers..." },
				async (
					{ manager, formatOptions, spinner },
					server?: string,
					name?: string,
					argsStr?: string,
				) => {
					if (server) {
						spinner.update(`Connecting to ${server}...`);
					}

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
				},
			),
		);
}
