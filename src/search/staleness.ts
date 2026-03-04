import type { SearchIndex, ServersFile } from "../config/schemas.ts";

/** Return server names that appear in the index but not in the current config */
export function getStaleServers(index: SearchIndex, servers: ServersFile): string[] {
  const configured = new Set(Object.keys(servers.mcpServers));
  const indexed = new Set(index.tools.map((t) => t.server));
  return [...indexed].filter((s) => !configured.has(s));
}
