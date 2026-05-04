import { describe, expect, test } from "bun:test";
import type { SearchIndex, ServersFile } from "../../src/config/schemas.ts";
import { EMBEDDING_MODEL } from "../../src/constants.ts";
import { getStaleServers, isEmbeddingModelStale } from "../../src/search/staleness.ts";

function makeIndex(overrides: Partial<SearchIndex> = {}): SearchIndex {
	return {
		version: 1,
		indexed_at: "2026-05-03T00:00:00Z",
		embedding_model: EMBEDDING_MODEL.REPO,
		tools: [
			{
				server: "arcade",
				tool: "Gmail_SendEmail",
				description: "Send an email",
				scenarios: [],
				keywords: [],
				embedding: [],
			},
		],
		...overrides,
	};
}

describe("getStaleServers", () => {
	test("returns empty when every indexed server is configured", () => {
		const index = makeIndex();
		const servers: ServersFile = { mcpServers: { arcade: { url: "https://example.com" } } };
		expect(getStaleServers(index, servers)).toEqual([]);
	});

	test("returns servers present in the index but missing from config", () => {
		const index = makeIndex({
			tools: [
				{ server: "arcade", tool: "a", description: "", scenarios: [], keywords: [], embedding: [] },
				{ server: "removed", tool: "b", description: "", scenarios: [], keywords: [], embedding: [] },
			],
		});
		const servers: ServersFile = { mcpServers: { arcade: { url: "https://example.com" } } };
		expect(getStaleServers(index, servers)).toEqual(["removed"]);
	});
});

describe("isEmbeddingModelStale", () => {
	test("returns false when the model matches the current constant", () => {
		expect(isEmbeddingModelStale(makeIndex())).toBe(false);
	});

	test("returns true when the indexed model differs and tools are present", () => {
		expect(isEmbeddingModelStale(makeIndex({ embedding_model: "Xenova/all-MiniLM-L6-v2" }))).toBe(true);
	});

	test("returns false when the index has no tools, even with a different model", () => {
		expect(isEmbeddingModelStale(makeIndex({ embedding_model: "something-else", tools: [] }))).toBe(false);
	});
});
