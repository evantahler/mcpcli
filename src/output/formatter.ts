import { bold, cyan, dim, green, red, yellow } from "ansis";
import type { Tool } from "../config/schemas.ts";
import type { ToolWithServer } from "../client/manager.ts";
import type { ValidationError } from "../validation/schema.ts";

export interface FormatOptions {
  json?: boolean;
  withDescriptions?: boolean;
}

/** Check if stdout is a TTY (interactive terminal) */
export function isInteractive(options: FormatOptions): boolean {
  if (options.json) return false;
  return process.stdout.isTTY ?? false;
}

/** Format a list of tools with server names */
export function formatToolList(tools: ToolWithServer[], options: FormatOptions): string {
  if (!isInteractive(options)) {
    if (options.withDescriptions) {
      return JSON.stringify(
        tools.map((t) => ({
          server: t.server,
          tool: t.tool.name,
          description: t.tool.description ?? "",
        })),
        null,
        2,
      );
    }
    return JSON.stringify(
      tools.map((t) => ({ server: t.server, tool: t.tool.name })),
      null,
      2,
    );
  }

  if (tools.length === 0) {
    return dim("No tools found");
  }

  // Calculate column widths
  const maxServer = Math.max(...tools.map((t) => t.server.length));
  const maxTool = Math.max(...tools.map((t) => t.tool.name.length));

  return tools
    .map((t) => {
      const server = cyan(t.server.padEnd(maxServer));
      const tool = bold(t.tool.name.padEnd(maxTool));
      if (options.withDescriptions && t.tool.description) {
        return `${server}  ${tool}  ${dim(t.tool.description)}`;
      }
      return `${server}  ${tool}`;
    })
    .join("\n");
}

/** Format tools for a single server */
export function formatServerTools(
  serverName: string,
  tools: Tool[],
  options: FormatOptions,
): string {
  if (!isInteractive(options)) {
    return JSON.stringify(
      {
        server: serverName,
        tools: tools.map((t) => ({ name: t.name, description: t.description ?? "" })),
      },
      null,
      2,
    );
  }

  if (tools.length === 0) {
    return dim(`No tools found for ${serverName}`);
  }

  const header = cyan.bold(serverName);
  const maxName = Math.max(...tools.map((t) => t.name.length));

  const lines = tools.map((t) => {
    const name = `  ${bold(t.name.padEnd(maxName))}`;
    if (t.description) {
      return `${name}  ${dim(t.description)}`;
    }
    return name;
  });

  return [header, ...lines].join("\n");
}

/** Format a tool schema */
export function formatToolSchema(serverName: string, tool: Tool, options: FormatOptions): string {
  if (!isInteractive(options)) {
    return JSON.stringify(
      {
        server: serverName,
        tool: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema,
      },
      null,
      2,
    );
  }

  const lines: string[] = [];
  lines.push(`${cyan(serverName)}/${bold(tool.name)}`);

  if (tool.description) {
    lines.push(dim(tool.description));
  }

  lines.push("");
  lines.push(bold("Input Schema:"));
  lines.push(formatSchema(tool.inputSchema, 2));

  return lines.join("\n");
}

/** Format a JSON schema as a readable parameter list */
function formatSchema(schema: Tool["inputSchema"], indent: number): string {
  const pad = " ".repeat(indent);
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  if (Object.keys(properties).length === 0) {
    return `${pad}${dim("(no parameters)")}`;
  }

  return Object.entries(properties)
    .map(([name, prop]) => {
      const p = prop as Record<string, unknown>;
      const type = (p.type as string) ?? "any";
      const req = required.has(name) ? red("*") : "";
      const desc = p.description ? `  ${dim(String(p.description))}` : "";
      return `${pad}${green(name)}${req} ${dim(`(${type})`)}${desc}`;
    })
    .join("\n");
}

/** Format a tool call result */
export function formatCallResult(result: unknown, _options: FormatOptions): string {
  // Call results are always JSON
  return JSON.stringify(result, null, 2);
}

/** Format validation errors for tool input */
export function formatValidationErrors(
  serverName: string,
  toolName: string,
  errors: ValidationError[],
  options: FormatOptions,
): string {
  if (!isInteractive(options)) {
    return JSON.stringify({
      error: "validation",
      server: serverName,
      tool: toolName,
      details: errors,
    });
  }

  const header = `${red("error:")} invalid arguments for ${cyan(serverName)}/${bold(toolName)}`;
  const details = errors.map((e) => `  ${yellow(e.path)}: ${e.message}`).join("\n");
  return `${header}\n${details}`;
}

/** Format an error message */
export function formatError(message: string, options: FormatOptions): string {
  if (!isInteractive(options)) {
    return JSON.stringify({ error: message });
  }
  return `${red("error:")} ${message}`;
}
