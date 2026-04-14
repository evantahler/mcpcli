import { bold, cyan, dim, green, yellow } from "ansis";
import type { Command } from "commander";
import {
	addPatterns,
	allExecPattern,
	allowCommandPattern,
	type Client,
	denyCommandPattern,
	execPattern,
	getMcpxPatterns,
	readClientSettings,
	readOnlyPatterns,
	resolveSettingsPath,
	type Scope,
	writeClientSettings,
} from "../lib/client-settings.ts";
import { formatOutput } from "../output/format-output.ts";
import type { FormatOptions } from "../output/formatter.ts";

export function registerAllowCommand(program: Command) {
	program
		.command("allow")
		.description("add permission rules for mcpx commands (Claude Code or Cursor)")
		.argument("[server]", "server name to allow")
		.argument("[tools...]", "specific tool names to allow")
		.option("--all", "allow all mcpx exec calls")
		.option("--all-read", "allow read-only commands (search, info, list, servers, ping, etc.)")
		.option("--list", "show current mcpx-related permissions")
		.option("--cursor", "target Cursor settings instead of Claude Code")
		.option("--local", "write to local settings (default)")
		.option("--project", "write to project settings (shared)")
		.option("--global", "write to global settings")
		.option("--dry-run", "show patterns without writing")
		.action(
			async (
				server: string | undefined,
				tools: string[],
				options: {
					all?: boolean;
					allRead?: boolean;
					list?: boolean;
					cursor?: boolean;
					local?: boolean;
					project?: boolean;
					global?: boolean;
					dryRun?: boolean;
				},
			) => {
				const formatOptions: FormatOptions = { json: program.opts().json };
				const client: Client = options.cursor ? "cursor" : "claude";

				// --list mode: show current permissions across all scopes
				if (options.list) {
					// Cursor maps local and project to the same file, so only show unique scopes
					const scopes: Scope[] =
						client === "cursor" ? ["local", "global"] : ["local", "project", "global"];
					const results: { scope: Scope; path: string; patterns: string[] }[] = [];

					for (const scope of scopes) {
						const path = resolveSettingsPath(scope, client);
						const settings = await readClientSettings(path);
						const patterns = getMcpxPatterns(settings, client);
						results.push({ scope, path, patterns });
					}

					console.log(
						formatOutput(
							results.map((r) => ({ scope: r.scope, path: r.path, patterns: r.patterns })),
							() => {
								const lines: string[] = [];
								for (const r of results) {
									lines.push(bold(`${r.scope}`) + dim(` (${r.path})`));
									if (r.patterns.length === 0) {
										lines.push(`  ${dim("(none)")}`);
									} else {
										for (const p of r.patterns) {
											lines.push(`  ${green("✓")} ${p}`);
										}
									}
									lines.push("");
								}
								return lines.join("\n").trimEnd();
							},
							formatOptions,
						),
					);
					return;
				}

				// Build the list of patterns to add
				const patterns: string[] = [];

				if (options.all) {
					patterns.push(allExecPattern(client));
				}

				if (options.allRead) {
					patterns.push(...readOnlyPatterns(client));
				}

				if (server && tools.length > 0) {
					for (const tool of tools) {
						patterns.push(execPattern(server, tool, client));
					}
				} else if (server) {
					patterns.push(execPattern(server, undefined, client));
				}

				if (patterns.length === 0) {
					console.error("error: specify a server, --all, or --all-read. See 'mcpx allow --help'.");
					process.exit(1);
				}

				// Always include allow/deny command patterns so the agent can self-manage
				patterns.push(allowCommandPattern(client));
				patterns.push(denyCommandPattern(client));

				const scope: Scope = options.global ? "global" : options.project ? "project" : "local";
				const path = resolveSettingsPath(scope, client);

				if (options.dryRun) {
					console.log(
						formatOutput(
							{ scope, path, patterns },
							() => {
								const lines: string[] = [];
								lines.push(bold("Dry run") + dim(` — would write to ${path}:`));
								for (const p of patterns) {
									lines.push(`  ${yellow("+")} ${p}`);
								}
								return lines.join("\n");
							},
							formatOptions,
						),
					);
					return;
				}

				const settings = await readClientSettings(path);
				const { settings: updated, added } = addPatterns(settings, patterns);
				await writeClientSettings(path, updated);

				console.log(
					formatOutput(
						{ scope, path, added, total: (updated.permissions?.allow ?? []).length },
						() => {
							const lines: string[] = [];
							if (added.length === 0) {
								lines.push(dim("All patterns already present — no changes."));
							} else {
								lines.push(bold(`Added ${added.length} permission(s)`) + dim(` → ${path}`));
								for (const p of added) {
									lines.push(`  ${green("+")} ${p}`);
								}
							}
							return lines.join("\n");
						},
						formatOptions,
					),
				);
			},
		);
}
