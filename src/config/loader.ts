import { join, resolve } from "path";
import { homedir } from "os";
import { interpolateEnv } from "./env.ts";
import {
  type Config,
  type ServersFile,
  type AuthFile,
  type SearchIndex,
  validateServersFile,
  validateAuthFile,
  validateSearchIndex,
} from "./schemas.ts";

const DEFAULT_CONFIG_DIR = join(homedir(), ".config", "mcpcli");

const EMPTY_SERVERS: ServersFile = { mcpServers: {} };
const EMPTY_AUTH: AuthFile = {};
const EMPTY_SEARCH_INDEX: SearchIndex = {
  version: 1,
  indexed_at: "",
  embedding_model: "claude",
  tools: [],
};

/** Read and parse a JSON file, returning undefined if it doesn't exist */
async function readJsonFile(path: string): Promise<unknown | undefined> {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;
  const text = await file.text();
  return JSON.parse(text);
}

/** Resolve the config directory from options, env, cwd, or default */
function resolveConfigDir(configFlag?: string): string {
  // 1. -c / --config flag
  if (configFlag) return resolve(configFlag);

  // 2. MCP_CONFIG_PATH env var
  const envPath = process.env.MCP_CONFIG_PATH;
  if (envPath) return resolve(envPath);

  // 3. ./servers.json exists in cwd → use cwd
  // (checked at load time, not here — we return the candidate dir)

  // 4. Default ~/.config/mcpcli/
  return DEFAULT_CONFIG_DIR;
}

/** Check if servers.json exists in the given directory */
async function hasServersFile(dir: string): Promise<boolean> {
  return Bun.file(join(dir, "servers.json")).exists();
}

export interface LoadConfigOptions {
  configFlag?: string;
}

/** Load and validate all config files */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<Config> {
  // Resolve config directory
  let configDir = resolveConfigDir(options.configFlag);

  // If the resolved dir doesn't have servers.json, check cwd
  if (!(await hasServersFile(configDir))) {
    const cwd = process.cwd();
    if (await hasServersFile(cwd)) {
      configDir = cwd;
    }
  }

  // Ensure config directory exists
  await Bun.write(join(configDir, ".keep"), "").catch(() => {});
  // Remove the .keep file, it was just to ensure the dir
  Bun.file(join(configDir, ".keep"))
    .exists()
    .then((exists) => {
      if (exists) Bun.write(join(configDir, ".keep"), "");
    });

  // Load servers.json
  const serversPath = join(configDir, "servers.json");
  const rawServers = await readJsonFile(serversPath);
  let servers: ServersFile;
  if (rawServers === undefined) {
    servers = EMPTY_SERVERS;
  } else {
    servers = validateServersFile(rawServers);
    // Interpolate env vars in server configs
    servers = {
      mcpServers: Object.fromEntries(
        Object.entries(servers.mcpServers).map(([name, config]) => [name, interpolateEnv(config)]),
      ),
    };
  }

  // Load auth.json
  const authPath = join(configDir, "auth.json");
  const rawAuth = await readJsonFile(authPath);
  const auth: AuthFile = rawAuth !== undefined ? validateAuthFile(rawAuth) : EMPTY_AUTH;

  // Load search.json
  const searchPath = join(configDir, "search.json");
  const rawSearch = await readJsonFile(searchPath);
  const searchIndex: SearchIndex =
    rawSearch !== undefined ? validateSearchIndex(rawSearch) : EMPTY_SEARCH_INDEX;

  return { configDir, servers, auth, searchIndex };
}

/** Save auth.json to the config directory */
export async function saveAuth(configDir: string, auth: AuthFile): Promise<void> {
  await Bun.write(join(configDir, "auth.json"), JSON.stringify(auth, null, 2) + "\n");
}

/** Save search.json to the config directory */
export async function saveSearchIndex(configDir: string, index: SearchIndex): Promise<void> {
  await Bun.write(join(configDir, "search.json"), JSON.stringify(index, null, 2) + "\n");
}
