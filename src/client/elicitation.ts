import { createInterface } from "node:readline";
import type {
  ElicitRequest,
  ElicitResult,
  ElicitRequestFormParams,
  ElicitRequestURLParams,
  PrimitiveSchemaDefinition,
} from "@modelcontextprotocol/sdk/types.js";
import { openBrowser } from "./browser.ts";
import { validateElicitationResponse } from "../validation/schema.ts";
import ansis from "ansis";

export interface ElicitationOptions {
  noInteractive: boolean;
  json: boolean;
}

type ElicitAction = "accept" | "cancel" | "decline";

/** Top-level elicitation request handler, registered on the MCP Client */
export async function handleElicitation(
  request: ElicitRequest,
  options: ElicitationOptions,
): Promise<ElicitResult> {
  if (options.noInteractive) {
    return { action: "decline" };
  }

  const params = request.params;
  const mode = (params as { mode?: string }).mode ?? "form";

  if (mode === "url") {
    return handleUrlElicitation(params as ElicitRequestURLParams, options);
  }
  return handleFormElicitation(params as ElicitRequestFormParams, options);
}

// ---------------------------------------------------------------------------
// Form mode
// ---------------------------------------------------------------------------

async function handleFormElicitation(
  params: ElicitRequestFormParams,
  options: ElicitationOptions,
): Promise<ElicitResult> {
  if (options.json) {
    return handleFormJson(params);
  }
  return handleFormInteractive(params);
}

/** JSON mode: write request to stdout, read ElicitResult from stdin */
async function handleFormJson(params: ElicitRequestFormParams): Promise<ElicitResult> {
  const request = {
    type: "elicitation",
    mode: "form",
    message: params.message,
    requestedSchema: params.requestedSchema,
  };
  console.log(JSON.stringify(request));

  const response = await readStdinLine();
  try {
    const parsed = JSON.parse(response);
    return {
      action: parsed.action ?? "cancel",
      content: parsed.content,
    };
  } catch {
    return { action: "cancel" };
  }
}

/** Interactive TTY: prompt user for each field */
async function handleFormInteractive(params: ElicitRequestFormParams): Promise<ElicitResult> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  try {
    process.stderr.write(`\n${ansis.bold("Server requests input:")} ${params.message}\n`);

    const schema = params.requestedSchema;
    const properties = schema.properties ?? {};
    const required = new Set((schema as { required?: string[] }).required ?? []);
    const content: Record<string, string | number | boolean | string[]> = {};

    for (const [key, fieldSchema] of Object.entries(properties)) {
      const isRequired = required.has(key);
      const value = await promptField(key, fieldSchema, isRequired, question);
      if (value === undefined) {
        if (isRequired) {
          process.stderr.write(ansis.yellow("Cancelled.\n"));
          return { action: "cancel" };
        }
        continue;
      }
      content[key] = value;
    }

    // Validate collected values against the full schema
    const validation = validateElicitationResponse(
      schema as unknown as Record<string, unknown>,
      content,
    );
    if (!validation.valid) {
      const msgs = validation.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
      process.stderr.write(ansis.red(`Validation failed:\n${msgs}\n`));
      return { action: "cancel" };
    }

    return { action: "accept", content };
  } finally {
    rl.close();
  }
}

async function promptField(
  key: string,
  schema: PrimitiveSchemaDefinition,
  isRequired: boolean,
  question: (prompt: string) => Promise<string>,
): Promise<string | number | boolean | string[] | undefined> {
  const label = (schema as { title?: string }).title ?? key;
  const desc = (schema as { description?: string }).description;
  const marker = isRequired ? ansis.red("*") : "";
  const type = (schema as { type?: string }).type;

  // Show description if present
  if (desc) {
    process.stderr.write(ansis.dim(`  ${desc}\n`));
  }

  // Enum (single-select)
  if (type === "string" && "enum" in schema) {
    return promptEnum(label, schema, marker, question);
  }
  if (type === "string" && "oneOf" in schema) {
    return promptOneOfEnum(label, schema, marker, question);
  }

  // Multi-select enum (array type)
  if (type === "array") {
    return promptMultiSelect(label, schema, marker, question);
  }

  // Boolean
  if (type === "boolean") {
    return promptBoolean(label, schema, marker, question);
  }

  // Number / integer
  if (type === "number" || type === "integer") {
    return promptNumber(label, schema, marker, question);
  }

  // String (default)
  return promptString(label, schema, marker, question);
}

async function promptString(
  label: string,
  schema: PrimitiveSchemaDefinition,
  marker: string,
  question: (prompt: string) => Promise<string>,
): Promise<string | undefined> {
  const def = (schema as { default?: string }).default;
  const defHint = def !== undefined ? ` [${def}]` : "";
  const answer = await question(`  ${marker}${label} (string)${defHint}: `);
  if (!answer && def !== undefined) return def;
  if (!answer) return undefined;
  return answer;
}

async function promptNumber(
  label: string,
  schema: PrimitiveSchemaDefinition,
  marker: string,
  question: (prompt: string) => Promise<string>,
): Promise<number | undefined> {
  const def = (schema as { default?: number }).default;
  const defHint = def !== undefined ? ` [${def}]` : "";
  const answer = await question(
    `  ${marker}${label} (${(schema as { type: string }).type})${defHint}: `,
  );
  if (!answer && def !== undefined) return def;
  if (!answer) return undefined;
  const num = Number(answer);
  if (Number.isNaN(num)) {
    process.stderr.write(ansis.red(`  Invalid number: ${answer}\n`));
    return undefined;
  }
  return num;
}

async function promptBoolean(
  label: string,
  schema: PrimitiveSchemaDefinition,
  marker: string,
  question: (prompt: string) => Promise<string>,
): Promise<boolean | undefined> {
  const def = (schema as { default?: boolean }).default;
  const defHint = def !== undefined ? ` [${def ? "Y/n" : "y/N"}]` : " [y/n]";
  const answer = await question(`  ${marker}${label}${defHint}: `);
  if (!answer && def !== undefined) return def;
  if (!answer) return undefined;
  return ["y", "yes", "true", "1"].includes(answer.toLowerCase());
}

async function promptEnum(
  label: string,
  schema: PrimitiveSchemaDefinition,
  marker: string,
  question: (prompt: string) => Promise<string>,
): Promise<string | undefined> {
  const values = (schema as { enum: string[] }).enum;
  const def = (schema as { default?: string }).default;
  process.stderr.write(`  ${marker}${label}:\n`);
  values.forEach((v, i) => {
    const defMark = v === def ? ansis.dim(" (default)") : "";
    process.stderr.write(`    [${i + 1}] ${v}${defMark}\n`);
  });
  const answer = await question("  > ");
  if (!answer && def !== undefined) return def;
  const idx = parseInt(answer, 10) - 1;
  if (idx >= 0 && idx < values.length) return values[idx];
  // Try matching by value directly
  if (values.includes(answer)) return answer;
  return undefined;
}

async function promptOneOfEnum(
  label: string,
  schema: PrimitiveSchemaDefinition,
  marker: string,
  question: (prompt: string) => Promise<string>,
): Promise<string | undefined> {
  const options = (schema as { oneOf: { const: string; title: string }[] }).oneOf;
  const def = (schema as { default?: string }).default;
  process.stderr.write(`  ${marker}${label}:\n`);
  options.forEach((opt, i) => {
    const defMark = opt.const === def ? ansis.dim(" (default)") : "";
    process.stderr.write(`    [${i + 1}] ${opt.title} (${opt.const})${defMark}\n`);
  });
  const answer = await question("  > ");
  if (!answer && def !== undefined) return def;
  const idx = parseInt(answer, 10) - 1;
  if (idx >= 0 && idx < options.length) return options[idx]!.const;
  // Try matching by const value directly
  const match = options.find((o) => o.const === answer);
  if (match) return match.const;
  return undefined;
}

async function promptMultiSelect(
  label: string,
  schema: PrimitiveSchemaDefinition,
  marker: string,
  question: (prompt: string) => Promise<string>,
): Promise<string[] | undefined> {
  const items = (
    schema as { items?: { enum?: string[]; anyOf?: { const: string; title: string }[] } }
  ).items;
  const def = (schema as { default?: string[] }).default;

  let values: string[];
  let titles: string[] | undefined;

  if (items?.anyOf) {
    values = items.anyOf.map((o) => o.const);
    titles = items.anyOf.map((o) => o.title);
  } else if (items?.enum) {
    values = items.enum;
  } else {
    return undefined;
  }

  process.stderr.write(`  ${marker}${label} (select multiple, comma-separated):\n`);
  values.forEach((v, i) => {
    const display = titles ? `${titles[i]} (${v})` : v;
    process.stderr.write(`    [${i + 1}] ${display}\n`);
  });
  const answer = await question("  > ");
  if (!answer && def !== undefined) return def;
  if (!answer) return undefined;

  const indices = answer.split(",").map((s) => parseInt(s.trim(), 10) - 1);
  const selected = indices.filter((i) => i >= 0 && i < values.length).map((i) => values[i]!);
  return selected.length > 0 ? selected : undefined;
}

// ---------------------------------------------------------------------------
// URL mode
// ---------------------------------------------------------------------------

async function handleUrlElicitation(
  params: ElicitRequestURLParams,
  options: ElicitationOptions,
): Promise<ElicitResult> {
  if (options.json) {
    return handleUrlJson(params);
  }
  return handleUrlInteractive(params);
}

async function handleUrlJson(params: ElicitRequestURLParams): Promise<ElicitResult> {
  const request = {
    type: "elicitation",
    mode: "url",
    message: params.message,
    url: params.url,
    elicitationId: params.elicitationId,
  };
  console.log(JSON.stringify(request));

  const response = await readStdinLine();
  try {
    const parsed = JSON.parse(response);
    return { action: (parsed.action as ElicitAction) ?? "cancel" };
  } catch {
    return { action: "cancel" };
  }
}

async function handleUrlInteractive(params: ElicitRequestURLParams): Promise<ElicitResult> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  try {
    const domain = (() => {
      try {
        return new URL(params.url).hostname;
      } catch {
        return "unknown";
      }
    })();

    process.stderr.write(`\n${ansis.bold("Server requests URL interaction:")}\n`);
    process.stderr.write(`  ${params.message}\n`);
    process.stderr.write(`  ${ansis.yellow("Domain:")} ${domain}\n`);
    process.stderr.write(`  ${ansis.yellow("URL:")} ${params.url}\n`);

    const answer = await question(`  Open in browser? [y/n]: `);
    if (["y", "yes"].includes(answer.toLowerCase())) {
      await openBrowser(params.url);
      return { action: "accept" };
    }
    return { action: "decline" };
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readStdinLine(): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin });
    rl.once("line", (line) => {
      rl.close();
      resolve(line);
    });
    rl.once("close", () => resolve(""));
  });
}
