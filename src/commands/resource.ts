import type { Command } from "commander";
import {
  formatResourceList,
  formatServerResources,
  formatResourceContents,
  formatError,
} from "../output/formatter.ts";
import { withCommand } from "./with-command.ts";

export function registerResourceCommand(program: Command) {
  program
    .command("resource [server] [uri]")
    .description("list resources for a server, or read a specific resource")
    .action(
      withCommand(
        program,
        { spinnerText: "Connecting to servers..." },
        async ({ manager, formatOptions, spinner }, server?: string, uri?: string) => {
          if (server) {
            spinner.update(`Connecting to ${server}...`);
          }

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
        },
      ),
    );
}
