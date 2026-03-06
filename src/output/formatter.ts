import { bold, cyan, dim, green, red, yellow } from "ansis";
import type { Tool, Resource, Prompt } from "../config/schemas.ts";
import type { ToolWithServer, ResourceWithServer, PromptWithServer } from "../client/manager.ts";
import type { ValidationError } from "../validation/schema.ts";
import type { SearchResult } from "../search/index.ts";

export interface FormatOptions {
  json?: boolean;
  withDescriptions?: boolean;
  verbose?: boolean;
  showSecrets?: boolean;
}

export interface UnifiedItem {
  server: string;
  type: "tool" | "resource" | "prompt";
  name: string;
  description?: string;
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

/** Format search results */
export function formatSearchResults(results: SearchResult[], options: FormatOptions): string {
  if (!isInteractive(options)) {
    return JSON.stringify(results, null, 2);
  }

  if (results.length === 0) {
    return dim("No matching tools found");
  }

  const maxServer = Math.max(...results.map((r) => r.server.length));
  const maxTool = Math.max(...results.map((r) => r.tool.length));

  // First line of description only for the main row
  const firstLine = (s: string) => s.split("\n")[0] ?? "";

  return results
    .map((r) => {
      const server = cyan(r.server.padEnd(maxServer));
      const tool = bold(r.tool.padEnd(maxTool));
      const score = yellow(r.score.toFixed(2).padStart(5));
      const summary = firstLine(r.description);
      const line = `${server}  ${tool}  ${score}  ${dim(summary)}`;

      // Show remaining description lines indented below
      const descLines = r.description.split("\n").slice(1);
      const extra = descLines.filter((l) => l.trim()).length > 0;
      if (!extra) return line;

      const indent = " ".repeat(maxServer + maxTool + 12);
      const rest = descLines
        .filter((l) => l.trim())
        .map((l) => `${indent}${dim(l.trim())}`)
        .join("\n");
      return `${line}\n${rest}`;
    })
    .join("\n");
}

/** Format a list of resources with server names */
export function formatResourceList(
  resources: ResourceWithServer[],
  options: FormatOptions,
): string {
  if (!isInteractive(options)) {
    return JSON.stringify(
      resources.map((r) => ({
        server: r.server,
        uri: r.resource.uri,
        name: r.resource.name,
        ...(options.withDescriptions ? { description: r.resource.description ?? "" } : {}),
      })),
      null,
      2,
    );
  }

  if (resources.length === 0) {
    return dim("No resources found");
  }

  const maxServer = Math.max(...resources.map((r) => r.server.length));
  const maxUri = Math.max(...resources.map((r) => r.resource.uri.length));

  return resources
    .map((r) => {
      const server = cyan(r.server.padEnd(maxServer));
      const uri = bold(r.resource.uri.padEnd(maxUri));
      if (options.withDescriptions && r.resource.description) {
        return `${server}  ${uri}  ${dim(r.resource.description)}`;
      }
      return `${server}  ${uri}`;
    })
    .join("\n");
}

/** Format resources for a single server */
export function formatServerResources(
  serverName: string,
  resources: Resource[],
  options: FormatOptions,
): string {
  if (!isInteractive(options)) {
    return JSON.stringify(
      {
        server: serverName,
        resources: resources.map((r) => ({
          uri: r.uri,
          name: r.name,
          description: r.description ?? "",
          mimeType: r.mimeType ?? "",
        })),
      },
      null,
      2,
    );
  }

  if (resources.length === 0) {
    return dim(`No resources found for ${serverName}`);
  }

  const header = cyan.bold(serverName);
  const maxUri = Math.max(...resources.map((r) => r.uri.length));

  const lines = resources.map((r) => {
    const uri = `  ${bold(r.uri.padEnd(maxUri))}`;
    if (r.description) {
      return `${uri}  ${dim(r.description)}`;
    }
    return uri;
  });

  return [header, ...lines].join("\n");
}

/** Format resource contents */
export function formatResourceContents(
  serverName: string,
  uri: string,
  result: unknown,
  options: FormatOptions,
): string {
  if (!isInteractive(options)) {
    return JSON.stringify(
      { server: serverName, uri, contents: (result as { contents: unknown })?.contents ?? result },
      null,
      2,
    );
  }

  const contents =
    (result as { contents?: Array<{ text?: string; blob?: string; mimeType?: string }> })
      ?.contents ?? [];
  const lines: string[] = [];
  lines.push(`${cyan(serverName)}/${bold(uri)}`);
  lines.push("");

  if (contents.length === 0) {
    lines.push(dim("(empty)"));
  } else {
    for (const item of contents) {
      if (item.text !== undefined) {
        lines.push(item.text);
      } else if (item.blob !== undefined) {
        lines.push(dim(`<binary blob, ${item.blob.length} bytes base64>`));
      }
    }
  }

  return lines.join("\n");
}

/** Format a list of prompts with server names */
export function formatPromptList(prompts: PromptWithServer[], options: FormatOptions): string {
  if (!isInteractive(options)) {
    return JSON.stringify(
      prompts.map((p) => ({
        server: p.server,
        name: p.prompt.name,
        ...(options.withDescriptions ? { description: p.prompt.description ?? "" } : {}),
      })),
      null,
      2,
    );
  }

  if (prompts.length === 0) {
    return dim("No prompts found");
  }

  const maxServer = Math.max(...prompts.map((p) => p.server.length));
  const maxName = Math.max(...prompts.map((p) => p.prompt.name.length));

  return prompts
    .map((p) => {
      const server = cyan(p.server.padEnd(maxServer));
      const name = bold(p.prompt.name.padEnd(maxName));
      if (options.withDescriptions && p.prompt.description) {
        return `${server}  ${name}  ${dim(p.prompt.description)}`;
      }
      return `${server}  ${name}`;
    })
    .join("\n");
}

/** Format prompts for a single server */
export function formatServerPrompts(
  serverName: string,
  prompts: Prompt[],
  options: FormatOptions,
): string {
  if (!isInteractive(options)) {
    return JSON.stringify(
      {
        server: serverName,
        prompts: prompts.map((p) => ({
          name: p.name,
          description: p.description ?? "",
          arguments: p.arguments ?? [],
        })),
      },
      null,
      2,
    );
  }

  if (prompts.length === 0) {
    return dim(`No prompts found for ${serverName}`);
  }

  const header = cyan.bold(serverName);
  const maxName = Math.max(...prompts.map((p) => p.name.length));

  const lines = prompts.map((p) => {
    const name = `  ${bold(p.name.padEnd(maxName))}`;
    const args =
      p.arguments && p.arguments.length > 0
        ? `  ${dim(`(${p.arguments.map((a) => (a.required ? a.name : `[${a.name}]`)).join(", ")})`)}`
        : "";
    if (p.description) {
      return `${name}${args}  ${dim(p.description)}`;
    }
    return `${name}${args}`;
  });

  return [header, ...lines].join("\n");
}

/** Format prompt messages */
export function formatPromptMessages(
  serverName: string,
  name: string,
  result: unknown,
  options: FormatOptions,
): string {
  if (!isInteractive(options)) {
    return JSON.stringify({ server: serverName, prompt: name, ...(result as object) }, null, 2);
  }

  const r = result as {
    description?: string;
    messages?: Array<{ role: string; content: { type: string; text?: string } }>;
  };
  const lines: string[] = [];
  lines.push(`${cyan(serverName)}/${bold(name)}`);

  if (r.description) {
    lines.push(dim(r.description));
  }

  lines.push("");

  for (const msg of r.messages ?? []) {
    lines.push(`${bold(msg.role)}:`);
    if (msg.content.text !== undefined) {
      lines.push(`  ${msg.content.text}`);
    }
  }

  return lines.join("\n");
}

/** Format a unified list of tools, resources, and prompts across servers */
export function formatUnifiedList(items: UnifiedItem[], options: FormatOptions): string {
  if (!isInteractive(options)) {
    return JSON.stringify(
      items.map((i) => ({
        server: i.server,
        type: i.type,
        name: i.name,
        ...(options.withDescriptions ? { description: i.description ?? "" } : {}),
      })),
      null,
      2,
    );
  }

  if (items.length === 0) {
    return dim("No tools, resources, or prompts found");
  }

  const maxServer = Math.max(...items.map((i) => i.server.length));
  const maxType = 8; // "resource" is the longest at 8 chars
  const maxName = Math.max(...items.map((i) => i.name.length));

  const typeLabel = (t: UnifiedItem["type"]) => {
    const padded = t.padEnd(maxType);
    if (t === "tool") return green(padded);
    if (t === "resource") return cyan(padded);
    return yellow(padded);
  };

  return items
    .map((i) => {
      const server = cyan(i.server.padEnd(maxServer));
      const type = typeLabel(i.type);
      const name = bold(i.name.padEnd(maxName));
      if (options.withDescriptions && i.description) {
        return `${server}  ${type}  ${name}  ${dim(i.description)}`;
      }
      return `${server}  ${type}  ${name}`;
    })
    .join("\n");
}

/** Format an error message */
export function formatError(message: string, options: FormatOptions): string {
  if (!isInteractive(options)) {
    return JSON.stringify({ error: message });
  }
  return `${red("error:")} ${message}`;
}
