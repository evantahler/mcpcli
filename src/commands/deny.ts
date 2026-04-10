import type { Command } from "commander";
import { bold, dim, green, red, yellow } from "ansis";
import {
  type Scope,
  resolveSettingsPath,
  readClaudeSettings,
  writeClaudeSettings,
  execPattern,
  readOnlyPatterns,
  allExecPattern,
  removePatterns,
  removeAllMcpxPatterns,
  getServerPatterns,
} from "../lib/claude-settings.ts";
import { formatOutput } from "../output/format-output.ts";
import type { FormatOptions } from "../output/formatter.ts";

export function registerDenyCommand(program: Command) {
  program
    .command("deny")
    .description("remove Claude Code permission rules for mcpx commands")
    .argument("[server]", "server name to deny")
    .argument("[tools...]", "specific tool names to deny")
    .option("--all", "remove all mcpx-related permissions")
    .option("--all-read", "remove read-only command permissions")
    .option("--local", "write to .claude/settings.local.json (default)")
    .option("--project", "write to .claude/settings.json (shared)")
    .option("--global", "write to ~/.claude/settings.json")
    .option("--dry-run", "show what would be removed")
    .action(
      async (
        server: string | undefined,
        tools: string[],
        options: {
          all?: boolean;
          allRead?: boolean;
          local?: boolean;
          project?: boolean;
          global?: boolean;
          dryRun?: boolean;
        },
      ) => {
        const formatOptions: FormatOptions = { json: program.opts().json };
        const scope: Scope = options.global ? "global" : options.project ? "project" : "local";
        const path = resolveSettingsPath(scope);
        const settings = await readClaudeSettings(path);

        let result: { settings: typeof settings; removed: string[] };

        if (options.all) {
          // Remove all mcpx-related patterns
          result = removeAllMcpxPatterns(settings);
        } else {
          // Build the list of patterns to remove
          const patterns: string[] = [];

          if (options.allRead) {
            patterns.push(...readOnlyPatterns());
          }

          if (server && tools.length > 0) {
            for (const tool of tools) {
              patterns.push(execPattern(server, tool));
            }
          } else if (server) {
            // Remove the server-level pattern AND all tool-specific patterns for this server
            patterns.push(execPattern(server));
            patterns.push(...getServerPatterns(settings, server));
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

        await writeClaudeSettings(path, result.settings);

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
