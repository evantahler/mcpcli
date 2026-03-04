import type { Command } from "commander";
import { loadRawServers, loadRawAuth, saveServers, saveAuth } from "../config/loader.ts";

export function registerRemoveCommand(program: Command) {
  program
    .command("remove <name>")
    .description("remove an MCP server from your config")
    .option("--keep-auth", "keep stored authentication credentials")
    .option("--dry-run", "show what would be removed without changing files")
    .action(async (name: string, options: { keepAuth?: boolean; dryRun?: boolean }) => {
      const configFlag = program.opts().config;
      const { configDir, servers } = await loadRawServers(configFlag);

      if (!servers.mcpServers[name]) {
        console.error(`Unknown server: "${name}"`);
        process.exit(1);
      }

      if (options.dryRun) {
        console.log(`Would remove server "${name}" from ${configDir}/servers.json`);
        if (!options.keepAuth) {
          const auth = await loadRawAuth(configDir);
          if (auth[name]) {
            console.log(`Would remove auth for "${name}" from ${configDir}/auth.json`);
          }
        }
        return;
      }

      delete servers.mcpServers[name];
      await saveServers(configDir, servers);
      console.log(`Removed server "${name}" from ${configDir}/servers.json`);

      if (!options.keepAuth) {
        const auth = await loadRawAuth(configDir);
        if (auth[name]) {
          delete auth[name];
          await saveAuth(configDir, auth);
          console.log(`Removed auth for "${name}" from ${configDir}/auth.json`);
        }
      }
    });
}
