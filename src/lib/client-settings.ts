import { join } from "path";
import { homedir } from "os";
import { readFile, mkdir, writeFile } from "fs/promises";

export type Client = "claude" | "cursor";
export type Scope = "local" | "project" | "global";

export interface ClientSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  [key: string]: unknown;
}

function prefix(client: Client): string {
  return client === "claude" ? "Bash" : "Shell";
}

/** Resolve the settings file path for a given scope and client */
export function resolveSettingsPath(scope: Scope, client: Client = "claude"): string {
  if (client === "cursor") {
    switch (scope) {
      case "local":
      case "project":
        return join(process.cwd(), ".cursor", "cli.json");
      case "global":
        return join(homedir(), ".cursor", "cli-config.json");
    }
  }

  switch (scope) {
    case "local":
      return join(process.cwd(), ".claude", "settings.local.json");
    case "project":
      return join(process.cwd(), ".claude", "settings.json");
    case "global":
      return join(homedir(), ".claude", "settings.json");
  }
}

/** Read client settings from a file, returning empty settings if the file doesn't exist */
export async function readClientSettings(path: string): Promise<ClientSettings> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as ClientSettings;
  } catch {
    return {};
  }
}

/** Write client settings to a file, creating parent directories as needed */
export async function writeClientSettings(path: string, settings: ClientSettings): Promise<void> {
  const dir = join(path, "..");
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

/** Generate a permission pattern for mcpx exec with a specific server and optional tool */
export function execPattern(server: string, tool?: string, client: Client = "claude"): string {
  const p = prefix(client);
  if (tool) {
    return `${p}(mcpx exec:${server}:${tool}:*)`;
  }
  return `${p}(mcpx exec:${server}:*)`;
}

/** Read-only mcpx commands that are safe to allow broadly */
const READ_ONLY_COMMANDS = [
  "search",
  "info",
  "servers",
  "ping",
  "resource",
  "prompt",
  "task",
  "index",
];

/** Generate patterns for all read-only mcpx commands */
export function readOnlyPatterns(client: Client = "claude"): string[] {
  const p = prefix(client);
  return READ_ONLY_COMMANDS.map((cmd) => `${p}(mcpx ${cmd}:*)`);
}

/** Generate the broad allow-all pattern for mcpx exec */
export function allExecPattern(client: Client = "claude"): string {
  return `${prefix(client)}(mcpx exec:*)`;
}

/** Generate the allow pattern for mcpx allow itself */
export function allowCommandPattern(client: Client = "claude"): string {
  return `${prefix(client)}(mcpx allow:*)`;
}

/** Generate the allow pattern for mcpx deny itself */
export function denyCommandPattern(client: Client = "claude"): string {
  return `${prefix(client)}(mcpx deny:*)`;
}

/** Check if a permission pattern is mcpx-related */
export function isMcpxPattern(pattern: string, client: Client = "claude"): boolean {
  return pattern.startsWith(`${prefix(client)}(mcpx `);
}

/** Add patterns to settings, deduplicating. Returns the updated settings and list of newly added patterns. */
export function addPatterns(
  settings: ClientSettings,
  patterns: string[],
): { settings: ClientSettings; added: string[] } {
  const existing = new Set(settings.permissions?.allow ?? []);
  const added: string[] = [];

  for (const p of patterns) {
    if (!existing.has(p)) {
      existing.add(p);
      added.push(p);
    }
  }

  return {
    settings: {
      ...settings,
      permissions: {
        ...settings.permissions,
        allow: [...existing],
      },
    },
    added,
  };
}

/** Remove specific patterns from settings. Returns the updated settings and list of removed patterns. */
export function removePatterns(
  settings: ClientSettings,
  patterns: string[],
): { settings: ClientSettings; removed: string[] } {
  const existing = settings.permissions?.allow ?? [];
  const toRemove = new Set(patterns);
  const removed: string[] = [];
  const remaining: string[] = [];

  for (const p of existing) {
    if (toRemove.has(p)) {
      removed.push(p);
    } else {
      remaining.push(p);
    }
  }

  return {
    settings: {
      ...settings,
      permissions: {
        ...settings.permissions,
        allow: remaining,
      },
    },
    removed,
  };
}

/** Remove all mcpx-related patterns from settings. Returns the updated settings and list of removed patterns. */
export function removeAllMcpxPatterns(
  settings: ClientSettings,
  client: Client = "claude",
): {
  settings: ClientSettings;
  removed: string[];
} {
  const existing = settings.permissions?.allow ?? [];
  const removed: string[] = [];
  const remaining: string[] = [];

  for (const p of existing) {
    if (isMcpxPattern(p, client)) {
      removed.push(p);
    } else {
      remaining.push(p);
    }
  }

  return {
    settings: {
      ...settings,
      permissions: {
        ...settings.permissions,
        allow: remaining,
      },
    },
    removed,
  };
}

/** Extract all mcpx-related patterns from settings */
export function getMcpxPatterns(settings: ClientSettings, client: Client = "claude"): string[] {
  return (settings.permissions?.allow ?? []).filter((p) => isMcpxPattern(p, client));
}

/** Get all mcpx-related patterns for a specific server */
export function getServerPatterns(
  settings: ClientSettings,
  server: string,
  client: Client = "claude",
): string[] {
  const p = prefix(client);
  return getMcpxPatterns(settings, client).filter(
    (pat) => pat.startsWith(`${p}(mcpx exec:${server}:`) || pat === `${p}(mcpx exec:${server}:*)`,
  );
}
