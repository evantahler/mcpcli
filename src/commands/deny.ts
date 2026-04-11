import type { Command } from "commander";
import { bold, dim, green, red, yellow } from "ansis";
import {
  type Client,
  type Scope,
  resolveSettingsPath,
  readClientSettings,
  writeClientSettings,
  execPattern,
  readOnlyPatterns,
  allExecPattern,
  removePatterns,
  removeAllMcpxPatterns,
  getServerPatterns,
} from "../lib/client-settings.ts";
import { formatOutput } from "../output/format-output.ts";
import type { FormatOptions } from "../output/formatter.ts";

export function registerDenyCommand(program: Command) {
  program
    .command("deny")
    .description("remove permission rules for mcpx commands (Claude Code or Cursor)")
    .argument("[server]", "server name to deny")
    .argument("[tools...]", "specific tool names to deny")
    .option("--all", "remove all mcpx-related permissions")
    .option("--all-read", "remove read-only command permissions")
    .option("--cursor", "target Cursor settings instead of Claude Code")
    .option("--local", "write to local settings (default)")
    .option("--project", "write to project settings (shared)")
    .option("--global", "write to global settings")
    .option("--dry-run", "show what would be removed")
    .action(
      async (
        server: string | undefined,
        tools: string[],
        options: {
          all?: boolean;
          allRead?: boolean;
          cursor?: boolean;
          local?: boolean;
          project?: boolean;
          global?: boolean;
          dryRun?: boolean;
        },
      ) => {
        const formatOptions: FormatOptions = { json: program.opts().json };
        const client: Client = options.cursor ? "cursor" : "claude";
        const scope: Scope = options.global ? "global" : options.project ? "project" : "local";
        const path = resolveSettingsPath(scope, client);
        const settings = await readClientSettings(path);

        let result: { settings: typeof settings; removed: string[] };

        if (options.all) {
          // Remove all mcpx-related patterns
          result = removeAllMcpxPatterns(settings, client);
        } else {
          // Build the list of patterns to remove
          const patterns: string[] = [];

          if (options.allRead) {
            patterns.push(...readOnlyPatterns(client));
          }

          if (server && tools.length > 0) {
            for (const tool of tools) {
              patterns.push(execPattern(server, tool, client));
            }
          } else if (server) {
            // Remove the server-level pattern AND all tool-specific patterns for this server
            patterns.push(execPattern(server, undefined, client));
            patterns.push(...getServerPatterns(settings, server, client));
          }

          if (patterns.length === 0) {
            console.error("error: specify a server, --all, or --all-read. See 'mcpx deny --help'.");
            process.exit(1);
          }

          result = removePatterns(settings, patterns);
        }

        if (options.dryRun) {
          console.log(
            formatOutput(
              { scope, path, wouldRemove: result.removed },
              () => {
                const lines: string[] = [];
                lines.push(bold("Dry run") + dim(` — would remove from ${path}:`));
                if (result.removed.length === 0) {
                  lines.push(`  ${dim("(no matching patterns found)")}`);
                } else {
                  for (const p of result.removed) {
                    lines.push(`  ${yellow("-")} ${p}`);
                  }
                }
                return lines.join("\n");
              },
              formatOptions,
            ),
          );
          return;
        }

        await writeClientSettings(path, result.settings);

        console.log(
          formatOutput(
            {
              scope,
              path,
              removed: result.removed,
              total: (result.settings.permissions?.allow ?? []).length,
            },
            () => {
              const lines: string[] = [];
              if (result.removed.length === 0) {
                lines.push(dim("No matching patterns found — no changes."));
              } else {
                lines.push(
                  bold(`Removed ${result.removed.length} permission(s)`) + dim(` → ${path}`),
                );
                for (const p of result.removed) {
                  lines.push(`  ${red("-")} ${p}`);
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
