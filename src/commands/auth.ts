import type { Command } from "commander";
import { getContext } from "../context.ts";
import { isHttpServer } from "../config/schemas.ts";
import { saveAuth } from "../config/loader.ts";
import { McpOAuthProvider, runOAuthFlow } from "../client/oauth.ts";
import { startSpinner } from "../output/spinner.ts";
import { runIndex } from "./index.ts";

export function registerAuthCommand(program: Command) {
  program
    .command("auth <server>")
    .description("authenticate with an HTTP MCP server")
    .option("-s, --status", "check auth status and token TTL")
    .option("-r, --refresh", "force token refresh")
    .option("--no-index", "skip rebuilding the search index after auth")
    .action(
      async (server: string, options: { status?: boolean; refresh?: boolean; index?: boolean }) => {
        const { config, formatOptions } = await getContext(program);

        const serverConfig = config.servers.mcpServers[server];
        if (!serverConfig) {
          console.error(`Unknown server: "${server}"`);
          process.exit(1);
        }
        if (!isHttpServer(serverConfig)) {
          console.error(
            `Server "${server}" is not an HTTP server — OAuth only applies to HTTP servers`,
          );
          process.exit(1);
        }

        const provider = new McpOAuthProvider({
          serverName: server,
          configDir: config.configDir,
          auth: config.auth,
        });

        if (options.status) {
          showStatus(server, provider);
          return;
        }

        if (options.refresh) {
          const spinner = startSpinner(`Refreshing token for "${server}"…`, formatOptions);
          try {
            await provider.refreshIfNeeded(serverConfig.url);
            spinner.success(`Token refreshed for "${server}"`);
          } catch (err) {
            spinner.error(`Refresh failed: ${err instanceof Error ? err.message : err}`);
            process.exit(1);
          }
          return;
        }

        // Default: full OAuth flow
        const spinner = startSpinner(`Authenticating with "${server}"…`, formatOptions);
        try {
          await runOAuthFlow(serverConfig.url, provider);
          spinner.success(`Authenticated with "${server}"`);
        } catch (err) {
          spinner.error(`Authentication failed: ${err instanceof Error ? err.message : err}`);
          process.exit(1);
        }

        if (options.index !== false) {
          await runIndex(program);
        }
      },
    );
}

export function registerDeauthCommand(program: Command) {
  program
    .command("deauth <server>")
    .description("remove stored authentication for a server")
    .action(async (server: string) => {
      const { config } = await getContext(program);

      if (!config.auth[server]) {
        console.log(`No auth stored for "${server}"`);
        return;
      }

      delete config.auth[server];
      await saveAuth(config.configDir, config.auth);
      console.log(`Deauthenticated "${server}"`);
    });
}

function showStatus(server: string, provider: McpOAuthProvider) {
  if (!provider.isComplete()) {
    console.log(`${server}: not authenticated`);
    return;
  }

  const expired = provider.isExpired();
  const hasRefresh = provider.hasRefreshToken();
  const status = expired ? "expired" : "authenticated";

  console.log(`${server}: ${status}`);
  if (hasRefresh) {
    console.log("  refresh token: present");
  }

  if (!expired) {
    // Show TTL if we have expires_at from the auth entry
    const entry = provider["auth"][server];
    if (entry?.expires_at) {
      const remaining = new Date(entry.expires_at).getTime() - Date.now();
      const minutes = Math.round(remaining / 60000);
      console.log(`  expires in: ${minutes} minutes`);
    }
  }
}
