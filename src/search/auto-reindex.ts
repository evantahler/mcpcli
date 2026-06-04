import type { ServerError, ToolWithServer } from "../client/manager.ts";
import { saveSearchIndex } from "../config/loader.ts";
import type { Config, SearchIndex } from "../config/schemas.ts";
import { type IndexProgress, reindexServers } from "./indexer.ts";
import { getDriftedServers, isEmbeddingModelStale } from "./staleness.ts";

/**
 * Detect tool drift against the existing search index and, if found, incrementally
 * re-index only the drifted servers and persist the result. Mutates `config.searchIndex`
 * in place so callers reading it afterwards see the refreshed index.
 *
 * No-ops (and returns no drifted servers) when:
 *  - there is no existing index (don't silently build a full index as a side effect), or
 *  - the index's embedding model is stale (that needs a full rebuild via `mcpx index`).
 *
 * Servers that failed to connect (present in `errors`) are never re-indexed or pruned.
 */
export async function maybeReindexDrift(
	config: Config,
	allLiveTools: ToolWithServer[],
	errors: ServerError[],
	onProgress?: (progress: IndexProgress) => void,
): Promise<{ servers: string[]; index: SearchIndex }> {
	const index = config.searchIndex;

	if (index.tools.length === 0 || isEmbeddingModelStale(index)) {
		return { servers: [], index };
	}

	const failed = new Set(errors.map((e) => e.server));
	const connectedServers = Object.keys(config.servers.mcpServers).filter((s) => !failed.has(s));

	const drifted = getDriftedServers(index, allLiveTools, connectedServers);
	if (drifted.length === 0) {
		return { servers: [], index };
	}

	const newIndex = await reindexServers(index, allLiveTools, drifted, onProgress);
	await saveSearchIndex(config.configDir, newIndex);
	config.searchIndex = newIndex;
	return { servers: drifted, index: newIndex };
}
