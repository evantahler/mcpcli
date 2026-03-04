import { bold, cyan, dim, green, red, yellow } from "ansis";
import type { Tool } from "../config/schemas.ts";
import type { ToolWithServer } from "../client/manager.ts";
import type { ValidationError } from "../validation/schema.ts";

export interface FormatOptions {
  json?: boolean;
  withDescriptions?: boolean;
  verbose?: boolean;
  showSecrets?: boolean;
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

/** Format detailed tool help with example payload */
export function formatToolHelp(serverName: string, tool: Tool, options: FormatOptions): string {
  if (!isInteractive(options)) {
    return JSON.stringify(
      {
        server: serverName,
        tool: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema,
        example: generateExample(tool.inputSchema),
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
  lines.push(bold("Parameters:"));
  lines.push(formatSchema(tool.inputSchema, 2));

  const example = generateExample(tool.inputSchema);
  lines.push("");
  lines.push(bold("Example:"));
  lines.push(dim(`  mcpcli call ${serverName} ${tool.name} '${JSON.stringify(example)}'`));

  return lines.join("\n");
}

/** Generate an example payload from a JSON schema */
function generateExample(schema: Tool["inputSchema"]): Record<string, unknown> {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const example: Record<string, unknown> = {};

  for (const [name, prop] of Object.entries(properties)) {
    const p = prop as Record<string, unknown>;
    // Include required fields and first few optional fields
    if (required.has(name) || Object.keys(example).length < 3) {
      example[name] = exampleValue(name, p);
    }
  }

  return example;
}

function exampleValue(name: string, prop: Record<string, unknown>): unknown {
  // Use enum first choice if available
  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    return prop.enum[0];
  }

  // Use default if provided
  if (prop.default !== undefined) {
    return prop.default;
  }

  const type = prop.type as string | undefined;
  switch (type) {
    case "string":
      return `<${name}>`;
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return true;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return `<${name}>`;
  }
}

/** Format a tool call result */
export function formatCallResult(result: unknown, _options: FormatOptions): string {
  return JSON.stringify(parseNestedJson(result), null, 2);
}

/** Recursively parse JSON strings inside MCP content blocks */
function parseNestedJson(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return parseNestedJson(JSON.parse(value));
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) {
    return value.map(parseNestedJson);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, parseNestedJson(v)]));
  }
  return value;
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
