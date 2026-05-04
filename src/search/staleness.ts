import type { SearchIndex, ServersFile } from "../config/schemas.ts";
import { EMBEDDING_MODEL } from "../constants.ts";

/** Return server names that appear in the index but not in the current config */
export function getStaleServers(index: SearchIndex, servers: ServersFile): string[] {
	const configured = new Set(Object.keys(servers.mcpServers));
	const indexed = new Set(index.tools.map((t) => t.server));
	return [...indexed].filter((s) => !configured.has(s));
}

/** Return true if the index was built with a different embedding model than the one we'd use now. */
export function isEmbeddingModelStale(index: SearchIndex): boolean {
	return index.tools.length > 0 && index.embedding_model !== EMBEDDING_MODEL.REPO;
}
