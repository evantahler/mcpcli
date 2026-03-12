import { cyan, dim, green, yellow } from "ansis";
import type { Command } from "commander";
import { getContext } from "../context.ts";
import { isStdioServer, isHttpServer } from "../config/schemas.ts";
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
                ...(isHttpServer(cfg) ? { transport: cfg.transport ?? "http" } : {}),
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

        function typeLabel(cfg: (typeof servers)[number][1]): string {
          if (isStdioServer(cfg)) return "stdio";
          if (isHttpServer(cfg) && cfg.transport === "sse") return "http/sse";
          if (isHttpServer(cfg) && cfg.transport === "streamable-http") return "http/streamable";
          return "http";
        }
        const maxType = Math.max(...servers.map(([, cfg]) => typeLabel(cfg).length));

        for (const [name, cfg] of servers) {
          const n = cyan(name.padEnd(maxName));
          const type = isStdioServer(cfg)
            ? green(typeLabel(cfg).padEnd(maxType))
            : yellow(typeLabel(cfg).padEnd(maxType));
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
