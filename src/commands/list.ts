import type { Command } from "commander";
import { formatUnifiedList } from "../output/formatter.ts";
import type { UnifiedItem } from "../output/formatter.ts";
import { withCommand } from "./with-command.ts";

export function registerListCommand(program: Command) {
  program.action(
    withCommand(
      program,
      { spinnerText: "Connecting to servers...", errorLabel: "Failed to list servers" },
      async ({ manager, formatOptions, spinner }) => {
        const [toolsResult, resourcesResult, promptsResult] = await Promise.all([
          manager.getAllTools(),
          manager.getAllResources(),
          manager.getAllPrompts(),
        ]);
        spinner.stop();

        const items: UnifiedItem[] = [
          ...toolsResult.tools.map((t) => ({
            server: t.server,
            type: "tool" as const,
            name: t.tool.name,
            description: t.tool.description,
          })),
          ...resourcesResult.resources.map((r) => ({
            server: r.server,
            type: "resource" as const,
            name: r.resource.uri,
            description: r.resource.description,
          })),
          ...promptsResult.prompts.map((p) => ({
            server: p.server,
            type: "prompt" as const,
            name: p.prompt.name,
            description: p.prompt.description,
          })),
        ];

        const typeOrder = { tool: 0, resource: 1, prompt: 2 };
        items.sort((a, b) => {
          if (a.server !== b.server) return a.server.localeCompare(b.server);
          if (a.type !== b.type) return typeOrder[a.type] - typeOrder[b.type];
          return a.name.localeCompare(b.name);
        });

        const errors = [...toolsResult.errors, ...resourcesResult.errors, ...promptsResult.errors];
        if (errors.length > 0) {
          for (const err of errors) {
            console.error(`"${err.server}": ${err.message}`);
          }
          if (items.length > 0) console.log("");
        }

        console.log(formatUnifiedList(items, formatOptions));
      },
    ),
  );
}
