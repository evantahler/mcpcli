import type { Command } from "commander";
import type { ServerConfig } from "../config/schemas.ts";
import { loadRawAuth, loadRawServers, saveServers } from "../config/loader.ts";
import { tryOAuthIfSupported, resolveResourceUrl } from "../client/oauth.ts";
import { runIndex } from "./index.ts";

export function registerAddCommand(program: Command) {
  program
    .command("add <name>")
    .description("add an MCP server to your config")
    .option("--command <cmd>", "command to run (stdio server)")
    .option("--args <args>", "comma-separated arguments for the command")
    .option("--env <vars>", "comma-separated KEY=VAL environment variables")
    .option("--cwd <dir>", "working directory for the command")
    .option("--url <url>", "server URL (HTTP server)")
    .option("--header <h>", "header in Key:Value format (repeatable)", collect, [])
    .option("--transport <type>", 'transport for HTTP servers: "sse" or "streamable-http"')
    .option("--allowed-tools <tools>", "comma-separated list of allowed tools")
    .option("--disabled-tools <tools>", "comma-separated list of disabled tools")
    .option("-f, --force", "overwrite if server already exists")
    .option("--no-auth", "skip automatic OAuth authentication after adding an HTTP server")
    .option("--no-index", "skip rebuilding the search index after adding")
    .action(
      async (
        name: string,
        options: {
          command?: string;
          args?: string;
          env?: string;
          cwd?: string;
          url?: string;
          header?: string[];
          transport?: string;
          allowedTools?: string;
          disabledTools?: string;
          force?: boolean;
          auth?: boolean;
          index?: boolean;
        },
      ) => {
        const hasCommand = !!options.command;
        const hasUrl = !!options.url;

        if (!hasCommand && !hasUrl) {
          console.error("Must specify --command (stdio) or --url (http)");
          process.exit(1);
        }
        if (hasCommand && hasUrl) {
          console.error("Cannot specify both --command and --url");
          process.exit(1);
        }

        const configFlag = program.opts().config;
        const { configDir, servers } = await loadRawServers(configFlag);

        if (servers.mcpServers[name] && !options.force) {
          console.error(`Server "${name}" already exists (use --force to overwrite)`);
          process.exit(1);
        }

        let config: ServerConfig;

        if (hasCommand) {
          config = buildStdioConfig(options);
        } else {
          config = buildHttpConfig(options);
        }

        if (hasUrl && options.transport) {
          if (options.transport !== "sse" && options.transport !== "streamable-http") {
            console.error('--transport must be "sse" or "streamable-http"');
            process.exit(1);
          }
          (config as { transport: string }).transport = options.transport;
        }

        // Common options
        if (options.allowedTools) {
          config.allowedTools = options.allowedTools.split(",").map((t) => t.trim());
        }
        if (options.disabledTools) {
          config.disabledTools = options.disabledTools.split(",").map((t) => t.trim());
        }

        // For HTTP servers, resolve the canonical resource URL before saving.
        // Some servers (e.g. hf.co → huggingface.co) advertise a different canonical
        // URL in their OAuth protected resource metadata, and the SDK enforces that the
        // stored URL matches this canonical URL during the OAuth token flow.
        let effectiveUrl = options.url!;
        if (hasUrl && options.auth !== false) {
          const canonical = await resolveResourceUrl(effectiveUrl);
          if (canonical !== effectiveUrl) {
            (config as { url: string }).url = canonical;
            effectiveUrl = canonical;
            console.log(`Resolved canonical URL: ${canonical}`);
          }
        }

        servers.mcpServers[name] = config;
        await saveServers(configDir, servers);
        console.log(`Added server "${name}" to ${configDir}/servers.json`);

        // Auto-auth: probe for OAuth support and run the flow if supported
        if (hasUrl && options.auth !== false) {
          const auth = await loadRawAuth(configDir);
          const formatOptions = {
            json: !!program.opts().json,
            verbose: !!program.opts().verbose,
            showSecrets: false,
          };
          try {
            await tryOAuthIfSupported(name, effectiveUrl, configDir, auth, formatOptions);
          } catch {
            console.error(`Warning: OAuth authentication failed. Run: mcpx auth ${name}`);
          }
        }

        // Commander treats --no-index as index=false (default true)
        if (options.index !== false) {
          await runIndex(program);
        }
      },
    );
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

function buildStdioConfig(options: {
  command?: string;
  args?: string;
  env?: string;
  cwd?: string;
}): ServerConfig {
  const config: Record<string, unknown> = { command: options.command! };

  if (options.args) {
    config.args = options.args.split(",").map((a) => a.trim());
  }

  if (options.env) {
    const env: Record<string, string> = {};
    for (const pair of options.env.split(",")) {
      const eqIdx = pair.indexOf("=");
      if (eqIdx === -1) {
        console.error(`Invalid env format "${pair}", expected KEY=VAL`);
        process.exit(1);
      }
      env[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
    }
    config.env = env;
  }

  if (options.cwd) {
    config.cwd = options.cwd;
  }

  return config as ServerConfig;
}

function buildHttpConfig(options: { url?: string; header?: string[] }): ServerConfig {
  const config: Record<string, unknown> = { url: options.url! };

  if (options.header && options.header.length > 0) {
    const headers: Record<string, string> = {};
    for (const h of options.header) {
      const colonIdx = h.indexOf(":");
      if (colonIdx === -1) {
        console.error(`Invalid header format "${h}", expected Key:Value`);
        process.exit(1);
      }
      headers[h.slice(0, colonIdx).trim()] = h.slice(colonIdx + 1).trim();
    }
    config.headers = headers;
  }

  return config as ServerConfig;
}
