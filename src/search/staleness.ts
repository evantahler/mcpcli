import type { ToolWithServer } from "../client/manager.ts";
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

/** Canonical, key-sorted JSON so object key ordering doesn't register as a change. */
function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Signature of one server's tool set: a sorted, canonical encoding of name + description + schema. */
function serverSignature(tools: { name: string; description?: string; inputSchema?: unknown }[]): string {
	return tools
		.map((t) => JSON.stringify([t.name, t.description ?? "", stableStringify(t.inputSchema)]))
		.sort()
		.join("\n");
}

/** Group an array by a key into a Map of key -> items. */
function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
	const map = new Map<string, T[]>();
	for (const item of items) {
		const k = key(item);
		const arr = map.get(k);
		if (arr) arr.push(item);
		else map.set(k, [item]);
	}
	return map;
}

/**
 * Return connected servers whose live tools differ from what's in the index —
 * i.e. tools were added, changed, or removed within a still-configured server.
 *
 * Only `connectedServers` (servers that returned tools without error) are considered,
 * so a server that failed to connect is never reported as drifted. A configured server
 * with no entries in the index yet counts as drifted ("new tools").
 */
export function getDriftedServers(
	index: SearchIndex,
	liveTools: ToolWithServer[],
	connectedServers: string[],
): string[] {
	const indexedByServer = groupBy(index.tools, (t) => t.server);
	const liveByServer = groupBy(liveTools, (t) => t.server);

	const drifted: string[] = [];
	for (const server of connectedServers) {
		const indexedSig = serverSignature(
			(indexedByServer.get(server) ?? []).map((t) => ({
				name: t.tool,
				description: t.description,
				inputSchema: t.input_schema,
			})),
		);
		const liveSig = serverSignature(
			(liveByServer.get(server) ?? []).map((t) => ({
				name: t.tool.name,
				description: t.tool.description,
				inputSchema: t.tool.inputSchema,
			})),
		);
		if (indexedSig !== liveSig) drifted.push(server);
	}
	return drifted;
}
