import { cyan, dim, green, yellow } from "ansis";
import type { Command } from "commander";
import { getContext } from "../context.ts";
import { isStdioServer } from "../config/schemas.ts";
import { formatError, isInteractive } from "../output/formatter.ts";

export function registerServersCommand(program: Command) {
  program
    .command("servers")
    .description("List configured MCP servers")
    .action(async () => {
      const { manager, config, formatOptions } = await getContext(program);
      try {
        const servers = Object.entries(config.servers.mcpServers);

        if (!isInteractive(formatOptions)) {
          console.log(
            JSON.stringify(
              servers.map(([name, cfg]) => ({
                name,
                type: isStdioServer(cfg) ? "stdio" : "http",
                ...(isStdioServer(cfg)
                  ? { command: cfg.command, args: cfg.args ?? [] }
                  : { url: cfg.url }),
              })),
              null,
              2,
            ),
          );
          return;
        }

        if (servers.length === 0) {
          console.log(dim("No servers configured"));
          return;
        }

        const maxName = Math.max(...servers.map(([n]) => n.length));
        const maxType = 5; // "stdio" / "http "

        for (const [name, cfg] of servers) {
          const n = cyan(name.padEnd(maxName));
          const type = isStdioServer(cfg)
            ? green("stdio".padEnd(maxType))
            : yellow("http ".padEnd(maxType));
          const detail = isStdioServer(cfg)
            ? dim([cfg.command, ...(cfg.args ?? [])].join(" "))
            : dim(cfg.url);
          console.log(`${n}  ${type}  ${detail}`);
        }
      } catch (err) {
        console.error(formatError(String(err), formatOptions));
        process.exit(1);
      } finally {
        await manager.close();
      }
    });
}
