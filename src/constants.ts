/** Environment variable names used by mcpx */
export const ENV = {
  DEBUG: "MCP_DEBUG",
  CONCURRENCY: "MCP_CONCURRENCY",
  TIMEOUT: "MCP_TIMEOUT",
  MAX_RETRIES: "MCP_MAX_RETRIES",
  STRICT_ENV: "MCP_STRICT_ENV",
  CONFIG_PATH: "MCP_CONFIG_PATH",
} as const;

/** Default values for configurable options */
export const DEFAULTS = {
  CONCURRENCY: 5,
  TIMEOUT_SECONDS: 1800,
  MAX_RETRIES: 3,
  TASK_TTL_MS: 60_000,
  SEARCH_TOP_K: 10,
  LOG_LEVEL: "warning",
} as const;
