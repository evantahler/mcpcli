const ENV_VAR_PATTERN = /\$\{([^}]+)\}/g;

/** Whether to throw on missing env vars (default: true) */
function isStrictEnv(): boolean {
  return process.env.MCP_STRICT_ENV !== "false";
}

/** Replace ${VAR_NAME} in a string with the corresponding env var value */
export function interpolateEnvString(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (_match, varName: string) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      if (isStrictEnv()) {
        throw new Error(
          `Environment variable "${varName}" is not set (set MCP_STRICT_ENV=false to warn instead)`,
        );
      }
      console.warn(`Warning: environment variable "${varName}" is not set`);
      return "";
    }
    return envValue;
  });
}

/** Recursively interpolate env vars in all string values of an object */
export function interpolateEnv<T>(obj: T): T {
  if (typeof obj === "string") {
    return interpolateEnvString(obj) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => interpolateEnv(item)) as T;
  }
  if (typeof obj === "object" && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateEnv(value);
    }
    return result as T;
  }
  return obj;
}
