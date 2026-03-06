import type { Command } from "commander";
import { getContext } from "../context.ts";
import {
  formatResourceList,
  formatServerResources,
  formatResourceContents,
  formatError,
} from "../output/formatter.ts";
import { logger } from "../output/logger.ts";

export function registerResourceCommand(program: Command) {
  program
    .command("resource [server] [uri]")
    .description("list resources for a server, or read a specific resource")
    .action(async (server: string | undefined, uri: string | undefined) => {
      const { manager, formatOptions } = await getContext(program);
      const spinner = logger.startSpinner(
        server ? `Connecting to ${server}...` : "Connecting to servers...",
        formatOptions,
      );
      try {
        if (server && uri) {
          const result = await manager.readResource(server, uri);
          spinner.stop();
          console.log(formatResourceContents(server, uri, result, formatOptions));
        } else if (server) {
          const resources = await manager.listResources(server);
          spinner.stop();
          console.log(formatServerResources(server, resources, formatOptions));
        } else {
          const { resources, errors } = await manager.getAllResources();
          spinner.stop();
          console.log(formatResourceList(resources, formatOptions));
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
    });
}
