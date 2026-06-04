import { describe, expect, test } from "bun:test";
import type { ToolWithServer } from "../../src/client/manager.ts";
import type { SearchIndex, ServersFile } from "../../src/config/schemas.ts";
import { EMBEDDING_MODEL } from "../../src/constants.ts";
import { getDriftedServers, getStaleServers, isEmbeddingModelStale } from "../../src/search/staleness.ts";

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

describe("getDriftedServers", () => {
	function liveTool(server: string, name: string, description = "", inputSchema?: unknown): ToolWithServer {
		return { server, tool: { name, description, inputSchema: inputSchema as ToolWithServer["tool"]["inputSchema"] } };
	}

	const index = makeIndex({
		tools: [
			{
				server: "arcade",
				tool: "Gmail_SendEmail",
				description: "Send an email",
				input_schema: { type: "object", properties: { to: { type: "string" } } },
				scenarios: [],
				keywords: [],
				embedding: [],
			},
		],
	});

	test("returns empty when live tools match the index", () => {
		const live = [
			liveTool("arcade", "Gmail_SendEmail", "Send an email", {
				type: "object",
				properties: { to: { type: "string" } },
			}),
		];
		expect(getDriftedServers(index, live, ["arcade"])).toEqual([]);
	});

	test("detects an added tool", () => {
		const live = [
			liveTool("arcade", "Gmail_SendEmail", "Send an email", {
				type: "object",
				properties: { to: { type: "string" } },
			}),
			liveTool("arcade", "Gmail_ListEmails", "List emails"),
		];
		expect(getDriftedServers(index, live, ["arcade"])).toEqual(["arcade"]);
	});

	test("detects a changed description", () => {
		const live = [
			liveTool("arcade", "Gmail_SendEmail", "Send a message", {
				type: "object",
				properties: { to: { type: "string" } },
			}),
		];
		expect(getDriftedServers(index, live, ["arcade"])).toEqual(["arcade"]);
	});

	test("detects a changed input schema", () => {
		const live = [
			liveTool("arcade", "Gmail_SendEmail", "Send an email", {
				type: "object",
				properties: { to: { type: "string" }, cc: { type: "string" } },
			}),
		];
		expect(getDriftedServers(index, live, ["arcade"])).toEqual(["arcade"]);
	});

	test("detects a tool removed from a server", () => {
		expect(getDriftedServers(index, [], ["arcade"])).toEqual(["arcade"]);
	});

	test("ignores schema key ordering differences", () => {
		// Same schema, keys declared in a different order — must NOT register as drift.
		const live = [
			liveTool("arcade", "Gmail_SendEmail", "Send an email", {
				properties: { to: { type: "string" } },
				type: "object",
			}),
		];
		expect(getDriftedServers(index, live, ["arcade"])).toEqual([]);
	});

	test("only considers connected servers", () => {
		// arcade drifted, but it's not in the connected list → not reported.
		const live = [liveTool("arcade", "Gmail_SendEmail", "Changed")];
		expect(getDriftedServers(index, live, [])).toEqual([]);
	});

	test("treats a configured server with no index entries as drifted", () => {
		const live = [liveTool("github", "search_repos", "Search repositories")];
		expect(getDriftedServers(index, live, ["github"])).toEqual(["github"]);
	});
});
