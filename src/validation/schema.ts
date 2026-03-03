import Ajv, { type ErrorObject } from "ajv";
import type { Tool } from "../config/schemas.ts";

const ajv = new Ajv({ allErrors: true, strict: false });

// Cache compiled validators by a key of "server/tool"
const validatorCache = new Map<string, ReturnType<typeof ajv.compile>>();

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/** Validate tool arguments against the tool's inputSchema */
export function validateToolInput(
  serverName: string,
  tool: Tool,
  input: Record<string, unknown>,
): ValidationResult {
  const schema = tool.inputSchema;
  if (!schema || Object.keys(schema).length === 0) {
    return { valid: true, errors: [] };
  }

  const cacheKey = `${serverName}/${tool.name}`;
  let validate = validatorCache.get(cacheKey);

  if (!validate) {
    try {
      validate = ajv.compile(schema);
      validatorCache.set(cacheKey, validate);
    } catch {
      // If schema can't be compiled, skip validation
      return { valid: true, errors: [] };
    }
  }

  const valid = validate(input);
  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors ?? []).map(formatAjvError);
  return { valid: false, errors };
}

function formatAjvError(err: ErrorObject): ValidationError {
  const path = err.instancePath
    ? err.instancePath.replace(/^\//, "").replace(/\//g, ".")
    : "(root)";

  switch (err.keyword) {
    case "required": {
      const field = (err.params as { missingProperty: string }).missingProperty;
      return { path: field, message: `missing required field "${field}"` };
    }
    case "type": {
      const expected = (err.params as { type: string }).type;
      return { path, message: `must be ${expected}` };
    }
    case "enum": {
      const allowed = (err.params as { allowedValues: unknown[] }).allowedValues;
      return { path, message: `must be one of: ${allowed.join(", ")}` };
    }
    case "additionalProperties": {
      const extra = (err.params as { additionalProperty: string }).additionalProperty;
      return { path: extra, message: `unknown property "${extra}"` };
    }
    default:
      return { path, message: err.message ?? "validation failed" };
  }
}
