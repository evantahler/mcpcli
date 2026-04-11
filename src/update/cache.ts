import { join } from "path";
import { DEFAULT_CONFIG_DIR } from "../constants.ts";
import type { UpdateCache } from "./checker.ts";

const UPDATE_CACHE_PATH = join(DEFAULT_CONFIG_DIR, "update.json");

/** Load the cached update check result, if it exists. */
export async function loadUpdateCache(): Promise<UpdateCache | undefined> {
  try {
    const file = Bun.file(UPDATE_CACHE_PATH);
    if (!(await file.exists())) return undefined;
    return JSON.parse(await file.text()) as UpdateCache;
  } catch {
    return undefined;
  }
}

/** Save update check result to the cache file. */
export async function saveUpdateCache(cache: UpdateCache): Promise<void> {
  try {
    await Bun.write(UPDATE_CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
  } catch {
    // Ignore write failures (e.g. permissions)
  }
}

/** Remove the cached update check result. */
export async function clearUpdateCache(): Promise<void> {
  try {
    const file = Bun.file(UPDATE_CACHE_PATH);
    if (await file.exists()) {
      await Bun.write(UPDATE_CACHE_PATH, "");
    }
  } catch {
    // Ignore
  }
}
