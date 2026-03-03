import type { Tool } from "../config/schemas.ts";
import type { ToolWithServer } from "../client/manager.ts";

// ANSI color codes
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";

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
    return `${DIM}No tools found${RESET}`;
  }

  // Calculate column widths
  const maxServer = Math.max(...tools.map((t) => t.server.length));
  const maxTool = Math.max(...tools.map((t) => t.tool.name.length));

  return tools
    .map((t) => {
      const server = `${CYAN}${t.server.padEnd(maxServer)}${RESET}`;
      const tool = `${BOLD}${t.tool.name.padEnd(maxTool)}${RESET}`;
      if (options.withDescriptions && t.tool.description) {
        return `${server}  ${tool}  ${DIM}${t.tool.description}${RESET}`;
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
    return `${DIM}No tools found for ${serverName}${RESET}`;
  }

  const header = `${CYAN}${BOLD}${serverName}${RESET}`;
  const maxName = Math.max(...tools.map((t) => t.name.length));

  const lines = tools.map((t) => {
    const name = `  ${BOLD}${t.name.padEnd(maxName)}${RESET}`;
    if (t.description) {
      return `${name}  ${DIM}${t.description}${RESET}`;
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
  lines.push(`${CYAN}${serverName}${RESET}/${BOLD}${tool.name}${RESET}`);

  if (tool.description) {
    lines.push(`${DIM}${tool.description}${RESET}`);
  }

  lines.push("");
  lines.push(`${BOLD}Input Schema:${RESET}`);
  lines.push(formatSchema(tool.inputSchema, 2));

  return lines.join("\n");
}

/** Format a JSON schema as a readable parameter list */
function formatSchema(schema: Tool["inputSchema"], indent: number): string {
  const pad = " ".repeat(indent);
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  if (Object.keys(properties).length === 0) {
    return `${pad}${DIM}(no parameters)${RESET}`;
  }

  return Object.entries(properties)
    .map(([name, prop]) => {
      const p = prop as Record<string, unknown>;
      const type = (p.type as string) ?? "any";
      const req = required.has(name) ? `${RED}*${RESET}` : "";
      const desc = p.description ? `  ${DIM}${p.description}${RESET}` : "";
      return `${pad}${GREEN}${name}${RESET}${req} ${DIM}(${type})${RESET}${desc}`;
    })
    .join("\n");
}

/** Format a tool call result */
export function formatCallResult(result: unknown, options: FormatOptions): string {
  // Call results are always JSON
  return JSON.stringify(result, null, 2);
}

/** Format an error message */
export function formatError(message: string, options: FormatOptions): string {
  if (!isInteractive(options)) {
    return JSON.stringify({ error: message });
  }
  return `${RED}error:${RESET} ${message}`;
}
