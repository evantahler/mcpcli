import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { StdioServerConfig } from "../config/schemas.ts";

export function createStdioTransport(config: StdioServerConfig): StdioClientTransport {
  return new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env ? { ...process.env, ...config.env } : undefined,
    cwd: config.cwd,
    stderr: "pipe",
  });
}
